(function() {
	//#region src/net.ts
	var NET_PARAMS = {
		kTop: .5,
		kBot: .08,
		mu: .12,
		damp: .03,
		kc: .5,
		grav: .133,
		shape: .012,
		edgeDamp: .06,
		ballMass: 30,
		maxBallAccel: .35
	};
	var SWAY_C = .11;
	var SWAY_LIFT = .1;
	var SWAY_GAIN = 1.5;
	var SWAY_MAX = 14;
	var MAX_NODE_SPEED = 6;
	var Net = class {
		n;
		px;
		py;
		vx;
		vy;
		rx;
		ry;
		ax;
		ay;
		row;
		front;
		ww;
		edges = [];
		cols;
		rows;
		offX = 0;
		sway = 0;
		swayV = 0;
		constructor(geom, ox, oy) {
			this.cols = geom.cols;
			this.rows = geom.rows;
			const n = this.n = this.cols * this.rows;
			this.px = new Float32Array(n);
			this.py = new Float32Array(n);
			this.vx = new Float32Array(n);
			this.vy = new Float32Array(n);
			this.rx = new Float32Array(n);
			this.ry = new Float32Array(n);
			this.ax = new Float32Array(n);
			this.ay = new Float32Array(n);
			this.row = new Int8Array(n);
			this.front = new Uint8Array(n);
			this.ww = new Float32Array(n);
			for (let r = 0; r < this.rows; r++) for (let k = 0; k < this.cols; k++) {
				const i = r * this.cols + k;
				this.rx[i] = this.px[i] = geom.x[i] + ox;
				this.ry[i] = this.py[i] = geom.y[i] + oy;
				this.row[i] = r;
				this.ww[i] = Math.pow(r / (this.rows - 1), 1.2);
				this.front[i] = geom.depth[i] >= 0 ? 1 : 0;
			}
			const link = (a, b, hem = false) => {
				const d = (geom.depth[a] + geom.depth[b]) / 2;
				this.edges.push({
					a,
					b,
					front: hem ? this.front[a] === 1 : d >= 0,
					L: Math.hypot(this.rx[a] - this.rx[b], this.ry[a] - this.ry[b]) * .985,
					w: (this.row[a] + this.row[b]) / 2 / (this.rows - 1)
				});
			};
			const C = this.cols;
			for (let r = 0; r < this.rows - 1; r++) for (let k = 0; k < C; k++) {
				const a = r * C + k;
				if (r % 2 === 0) {
					link(a, (r + 1) * C + k);
					link(a, (r + 1) * C + (k + C - 1) % C);
				} else {
					link(a, (r + 1) * C + k);
					link(a, (r + 1) * C + (k + 1) % C);
				}
			}
			const last = (this.rows - 1) * C;
			for (let k = 0; k < C; k++) link(last + k, last + (k + 1) % C, true);
		}
		impulse(dx, dy) {
			for (let i = this.cols; i < this.n; i++) {
				const w = this.row[i] / (this.rows - 1);
				this.vx[i] += dx * w;
				this.vy[i] += dy * w;
			}
		}
		setHoop(ms, offX, hoopAcc) {
			const frames = ms / (1e3 / 60);
			this.offX = offX;
			const sdt = frames / 2;
			for (let i = 0; i < 2; i++) {
				const a = -.05 * this.sway - SWAY_C * this.swayV - hoopAcc * SWAY_GAIN / 2;
				this.swayV += a * sdt;
				this.sway += this.swayV * sdt;
			}
			this.sway = Math.max(-14, Math.min(SWAY_MAX, this.sway));
		}
		step(dt, ball) {
			const P = NET_PARAMS;
			const C = this.cols;
			const n = this.n;
			let fbx = 0;
			let fby = 0;
			for (let i = C; i < n; i++) {
				this.ax[i] = (this.rx[i] - this.px[i]) * P.shape;
				this.ay[i] = P.grav + (this.ry[i] - this.py[i]) * P.shape;
			}
			for (const e of this.edges) {
				const a = e.a;
				const b = e.b;
				const dx = this.px[b] - this.px[a];
				const dy = this.py[b] - this.py[a];
				const d = Math.hypot(dx, dy) || 1e-4;
				const ux = dx / d;
				const uy = dy / d;
				const k = P.kTop + (P.kBot - P.kTop) * e.w;
				let f = d > e.L ? k * (d - e.L) : 0;
				const rv = (this.vx[b] - this.vx[a]) * ux + (this.vy[b] - this.vy[a]) * uy;
				f += P.edgeDamp * rv * (d > e.L * .98 ? 1 : .3);
				if (a >= C) {
					this.ax[a] += f * ux;
					this.ay[a] += f * uy;
				}
				if (b >= C) {
					this.ax[b] -= f * ux;
					this.ay[b] -= f * uy;
				}
			}
			if (ball) for (let i = C; i < n; i++) {
				const sx = this.offX + this.sway * this.ww[i];
				const sy = -.1 * Math.abs(this.sway) * this.ww[i];
				const dx = this.px[i] + sx - ball.x;
				const dy = this.py[i] + sy - ball.y;
				const dist = Math.hypot(dx, dy);
				const min = ball.r + .6;
				if (dist < min && dist > .001) {
					const nx = dx / dist;
					const ny = dy / dist;
					const F = P.kc * (min - dist);
					this.ax[i] += F * nx;
					this.ay[i] += F * ny;
					fbx -= F * nx;
					fby -= F * ny;
					const rvx = ball.vx - this.vx[i];
					const rvy = ball.vy - this.vy[i];
					this.ax[i] += P.mu * rvx;
					this.ay[i] += P.mu * rvy;
					fbx -= P.mu * rvx;
					fby -= P.mu * rvy;
				}
			}
			for (let i = C; i < n; i++) {
				this.vx[i] = (this.vx[i] + this.ax[i] * dt) * (1 - P.damp * dt);
				this.vy[i] = (this.vy[i] + this.ay[i] * dt) * (1 - P.damp * dt);
				const sp = Math.hypot(this.vx[i], this.vy[i]);
				if (sp > MAX_NODE_SPEED) {
					this.vx[i] *= MAX_NODE_SPEED / sp;
					this.vy[i] *= MAX_NODE_SPEED / sp;
				}
				this.px[i] += this.vx[i] * dt;
				this.py[i] += this.vy[i] * dt;
			}
			return [fbx, fby];
		}
		line(ctx, x0, y0, x1, y1) {
			let ax = Math.round(x0);
			let ay = Math.round(y0);
			const bx = Math.round(x1);
			const by = Math.round(y1);
			const dx = Math.abs(bx - ax);
			const dy = -Math.abs(by - ay);
			const sx = ax < bx ? 1 : -1;
			const sy = ay < by ? 1 : -1;
			let e = dx + dy;
			for (;;) {
				ctx.fillRect(ax, ay, 1, 1);
				if (ax === bx && ay === by) break;
				const e2 = 2 * e;
				if (e2 >= dy) {
					e += dy;
					ax += sx;
				}
				if (e2 <= dx) {
					e += dx;
					ay += sy;
				}
			}
		}
		wx(i) {
			return this.px[i] + this.offX + this.sway * this.ww[i];
		}
		wy(i) {
			return this.py[i] - SWAY_LIFT * Math.abs(this.sway) * this.ww[i];
		}
		draw(ctx, layer) {
			const wantFront = layer === "front";
			const shadow = wantFront ? "#8a909c" : "#6f7682";
			const cord = wantFront ? "#ffffff" : "#c4c9d2";
			const list = this.edges.filter((e) => e.front === wantFront);
			ctx.fillStyle = shadow;
			for (const e of list) this.line(ctx, this.wx(e.a) + 1, this.wy(e.a), this.wx(e.b) + 1, this.wy(e.b));
			ctx.fillStyle = cord;
			for (const e of list) this.line(ctx, this.wx(e.a), this.wy(e.a), this.wx(e.b), this.wy(e.b));
			for (let i = this.cols; i < this.n; i++) {
				if (this.front[i] === 1 !== wantFront) continue;
				const x = Math.round(this.wx(i));
				const y = Math.round(this.wy(i));
				ctx.fillStyle = shadow;
				ctx.fillRect(x, y, 2, 2);
				ctx.fillStyle = wantFront ? "#ffffff" : "#e4e8ee";
				ctx.fillRect(x - 1, y - 1, 2, 2);
			}
		}
	};
	//#endregion
	//#region src/draw.ts
	var DARK = "#1c1c22";
	var HALO = "rgba(255,255,255,0.92)";
	//#endregion
	//#region src/sprites.ts
	function haloCanvas(pix, w, h) {
		const cv = document.createElement("canvas");
		cv.width = w;
		cv.height = h;
		const g = cv.getContext("2d");
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const c = pix[y * w + x];
			if (c) {
				g.fillStyle = c;
				g.fillRect(x, y, 1, 1);
				continue;
			}
			let nb = false;
			for (let dy = -1; dy <= 1 && !nb; dy++) for (let dx = -1; dx <= 1; dx++) {
				const xx = x + dx;
				const yy = y + dy;
				if (xx >= 0 && yy >= 0 && xx < w && yy < h && pix[yy * w + xx]) {
					nb = true;
					break;
				}
			}
			if (nb) {
				g.fillStyle = HALO;
				g.fillRect(x, y, 1, 1);
			}
		}
		return cv;
	}
	function inPoly(x, y, pts) {
		let c = false;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const a = pts[i];
			const b = pts[j];
			if (a[1] > y !== b[1] > y && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
		}
		return c;
	}
	var ISO_W = 80;
	var ISO_H = 88;
	var RING_R = 13;
	var NET_T = [
		0,
		.42,
		.72,
		1
	];
	var NET_COLS = 12;
	var Iso = class {
		side;
		ox;
		oy;
		h;
		base;
		front;
		cur;
		constructor(side, ox, oy, h = ISO_H) {
			this.side = side;
			this.ox = ox;
			this.oy = oy;
			this.h = h;
			this.base = new Array(ISO_W * h).fill(null);
			this.front = new Array(ISO_W * h).fill(null);
			this.cur = this.base;
		}
		p(a, b, z) {
			const x = this.side === "right" ? a : b;
			const y = this.side === "right" ? b : a;
			return [this.ox + (x - y), this.oy + (x + y) * .5 - z];
		}
		set(x, y, c) {
			const xx = Math.round(x);
			const yy = Math.round(y);
			if (xx >= 0 && yy >= 0 && xx < ISO_W && yy < this.h) this.cur[yy * ISO_W + xx] = c;
		}
		line(A, B, c) {
			let x0 = Math.round(A[0]);
			let y0 = Math.round(A[1]);
			const x1 = Math.round(B[0]);
			const y1 = Math.round(B[1]);
			const dx = Math.abs(x1 - x0);
			const dy = -Math.abs(y1 - y0);
			const sx = x0 < x1 ? 1 : -1;
			const sy = y0 < y1 ? 1 : -1;
			let e = dx + dy;
			for (;;) {
				this.set(x0, y0, c);
				if (x0 === x1 && y0 === y1) break;
				const e2 = 2 * e;
				if (e2 >= dy) {
					e += dy;
					x0 += sx;
				}
				if (e2 <= dx) {
					e += dx;
					y0 += sy;
				}
			}
		}
		poly(pts, c) {
			let mnx = 1e9;
			let mxx = -1e9;
			let mny = 1e9;
			let mxy = -1e9;
			for (const p of pts) {
				mnx = Math.min(mnx, p[0]);
				mxx = Math.max(mxx, p[0]);
				mny = Math.min(mny, p[1]);
				mxy = Math.max(mxy, p[1]);
			}
			for (let y = Math.max(0, Math.floor(mny)); y <= Math.min(this.h - 1, Math.ceil(mxy)); y++) for (let x = Math.max(0, Math.floor(mnx)); x <= Math.min(79, Math.ceil(mxx)); x++) if (inPoly(x + .5, y + .5, pts)) this.set(x, y, c);
		}
		outline(pts, c) {
			for (let i = 0; i < pts.length; i++) this.line(pts[i], pts[(i + 1) % pts.length], c);
		}
		box(a0, a1, b0, b1, z0, z1, cols, out) {
			const P = (a, b, z) => this.p(a, b, z);
			const top = [
				P(a0, b0, z1),
				P(a1, b0, z1),
				P(a1, b1, z1),
				P(a0, b1, z1)
			];
			const front = [
				P(a0, b1, z1),
				P(a1, b1, z1),
				P(a1, b1, z0),
				P(a0, b1, z0)
			];
			const side = [
				P(a1, b0, z1),
				P(a1, b1, z1),
				P(a1, b1, z0),
				P(a1, b0, z0)
			];
			this.poly(top, cols.top);
			this.poly(side, cols.side);
			this.poly(front, cols.front);
			this.outline(top, out);
			this.outline(side, out);
			this.outline(front, out);
		}
	};
	function ringArc(iso, front) {
		const n = 260;
		for (let i = 0; i < n; i++) {
			const th = i / n * 2 * Math.PI;
			if (Math.cos(th) + Math.sin(th) >= 0 !== front) continue;
			const a = RING_R * Math.cos(th);
			const b = RING_R * Math.sin(th);
			for (let k = 0; k < 3; k++) {
				const pt = iso.p(a, b, -k);
				let col;
				if (front) {
					const lit = Math.cos(th) - Math.sin(th) < 0;
					col = k === 0 ? lit ? "#ff9a50" : "#f2782a" : k === 2 ? "#d8561c" : lit ? "#f2782a" : "#d8561c";
				} else col = "#7a3010";
				iso.set(pt[0], pt[1], col);
			}
			if (front) {
				const p0 = iso.p(a, b, 1);
				const p1 = iso.p(a, b, -3);
				iso.set(p0[0], p0[1], DARK);
				iso.set(p1[0], p1[1], DARK);
			}
		}
	}
	function makeHoopSprite(side) {
		const iso = new Iso(side, side === "right" ? 26 : 50, 44);
		const bF = -16;
		const bB = -19;
		const aW = 12;
		const zLo = -9;
		const zHi = 19;
		iso.box(-12, aW, bB, bF, zLo, zHi, {
			top: "#f2f4f7",
			front: "#eaf1f5",
			side: "#8a909c"
		}, DARK);
		const P = (a, b, z) => iso.p(a, b, z);
		const inner = [
			P(-10, bF, 17),
			P(10, bF, 17),
			P(10, bF, -7),
			P(-10, bF, -7)
		];
		iso.poly(inner, "#d4e0e8");
		iso.poly([
			P(-10, bF, 2),
			P(10, bF, 2),
			P(10, bF, -7),
			P(-10, bF, -7)
		], "#b8c8d4");
		iso.outline(inner, "#8a909c");
		iso.outline([
			P(-5, bF, 1),
			P(5, bF, 1),
			P(5, bF, 10),
			P(-5, bF, 10)
		], "#d8402f");
		iso.box(-1, 1, -16, -13, -2, 0, {
			top: "#c4c9d2",
			front: "#8a909c",
			side: "#4a4f5a"
		}, DARK);
		ringArc(iso, false);
		iso.cur = iso.front;
		ringArc(iso, true);
		let minX = ISO_W;
		let maxX = 0;
		let minY = ISO_H;
		let maxY = 0;
		for (const arr of [iso.base, iso.front]) for (let y = 0; y < ISO_H; y++) for (let x = 0; x < ISO_W; x++) if (arr[y * ISO_W + x]) {
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		const sx = minX - 1;
		const sy = minY - 1;
		const w = maxX - minX + 3;
		const h = maxY - minY + 3;
		const crop = (arr) => {
			const out = new Array(w * h).fill(null);
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
				const xx = x + sx;
				const yy = y + sy;
				if (xx >= 0 && yy >= 0 && xx < ISO_W && yy < ISO_H) out[y * w + x] = arr[yy * ISO_W + xx];
			}
			return haloCanvas(out, w, h);
		};
		const geomRows = NET_T.length;
		const gx = [];
		const gy = [];
		const gd = [];
		for (let r = 0; r < geomRows; r++) {
			const t = NET_T[r];
			const rad = 12 * (1 - t) + 8 * t;
			for (let k = 0; k < NET_COLS; k++) {
				const th = (k + (r & 1 ? .5 : 0)) / NET_COLS * 2 * Math.PI;
				const a = rad * Math.cos(th);
				const b = rad * Math.sin(th);
				const pt = iso.p(a, b, -24 * t);
				gx.push(pt[0] - sx);
				gy.push(pt[1] - sy);
				gd.push(a + b);
			}
		}
		const cut = (a, b, z) => {
			const pt = iso.p(a, b, z);
			return [pt[0] - sx, pt[1] - sy];
		};
		const hull = [
			cut(0, bB, zHi),
			cut(0, bF, zHi),
			cut(0, bF, zLo),
			cut(0, bB, zLo)
		];
		const reach = RING_R * Math.SQRT2;
		const cxr = iso.ox - sx;
		const open = side === "right" ? cxr - reach : cxr + reach;
		const closed = side === "right" ? cxr + reach : cxr - reach;
		return {
			canvas: crop(iso.base),
			front: crop(iso.front),
			w,
			h,
			frontX: open,
			backX: closed,
			rimY: iso.oy - sy,
			rimCx: cxr,
			netLen: 26,
			hull,
			shiftX: sx,
			shiftY: sy,
			poleTop: [cut(0, -24, 3), cut(0, -20, 3)],
			netGeom: {
				cols: NET_COLS,
				rows: geomRows,
				x: gx,
				y: gy,
				depth: gd
			}
		};
	}
	//#endregion
	//#region ../../../../../private/tmp/claude-501/-Users-user-Documents-Code-Hoops/b1238af6-9bb2-4a47-b7bb-dfb5618c3255/scratchpad/nethit/entry.ts
	window.H = {
		Net,
		makeHoopSprite
	};
	//#endregion
})();
