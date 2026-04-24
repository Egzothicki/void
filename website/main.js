/* =====================================================================
   SinWeave product site — interactivity
   - OS detection (routes the big CTA to the right DMG asset)
   - Animated hero sine wave (SVG <path d>)
   - Scroll-reveal (IntersectionObserver)
   - Topbar shadow on scroll
   - Live latency readout (cute, decorative)
   ===================================================================== */
(() => {
	'use strict';

	// -----------------------------------------------------------------
	// Config
	// -----------------------------------------------------------------
	// Release asset URLs. Uses GitHub's "latest" redirect so you don't
	// have to touch this file on every release — just upload assets with
	// matching names to your next release.
	const GH_REPO = 'https://github.com/Egzothicki/void';
	const RELEASES = GH_REPO + '/releases';
	const LATEST = GH_REPO + '/releases/latest/download';

	const DL = {
		'mac-arm':   LATEST + '/SinWeave-darwin-arm64.dmg',
		'mac-x64':   LATEST + '/SinWeave-darwin-x64.dmg',
		'win-x64':   LATEST + '/SinWeave-win32-x64-user.exe',
		'linux-deb': LATEST + '/SinWeave-linux-x64.deb',
		'any':       RELEASES,
	};

	// -----------------------------------------------------------------
	// OS detection
	// -----------------------------------------------------------------
	// `navigator.platform` is deprecated but still works everywhere. The
	// UA-CH API (navigator.userAgentData) is cleaner but gated by browser.
	function detectOS() {
		const ua = navigator.userAgent || '';
		const platform = (navigator.platform || '').toLowerCase();

		const isMac   = /mac/i.test(platform) || /mac os x|macintosh/i.test(ua);
		const isWin   = /win/i.test(platform) || /windows/i.test(ua);
		const isLinux = /linux/i.test(platform) && !/android/i.test(ua);

		// Apple Silicon vs Intel is not reliably exposed. Best effort:
		// try UA-CH's getHighEntropyValues synchronously → fall back to
		// assuming arm64 (the common case for new Macs in 2026+).
		let macArch = 'arm64';
		try {
			if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
				// Kick this off async but we need a sync answer; start
				// with arm64 and upgrade the label if Intel is detected.
				navigator.userAgentData.getHighEntropyValues(['architecture']).then((v) => {
					if (v && v.architecture && /x86/i.test(v.architecture)) {
						macArch = 'x64';
						applyOS({ kind: 'mac', arch: 'x64' });
					}
				}).catch(() => {});
			}
		} catch { /* no-op */ }

		if (isMac)   return { kind: 'mac',   arch: macArch };
		if (isWin)   return { kind: 'win',   arch: 'x64' };
		if (isLinux) return { kind: 'linux', arch: 'x64' };
		return { kind: 'other', arch: null };
	}

	function applyOS(os) {
		const labelEl      = document.querySelector('[data-os-label]');
		const primaryEl    = document.querySelector('[data-os-primary]');
		const secondaryEl  = document.querySelector('[data-os-secondary]');
		const primaryBtn   = document.querySelector('[data-os-href]');
		const navDownload  = document.querySelector('[data-nav-download]');

		let primary, secondary, href;
		if (os.kind === 'mac') {
			primary   = 'Download for Mac';
			secondary = os.arch === 'x64'
				? 'macOS · Intel · .dmg'
				: 'macOS · Apple Silicon · .dmg';
			href = os.arch === 'x64' ? DL['mac-x64'] : DL['mac-arm'];
		} else if (os.kind === 'win') {
			primary   = 'Download for Windows';
			secondary = 'Windows 10+ · x64 · coming soon';
			href = RELEASES;
		} else if (os.kind === 'linux') {
			primary   = 'Download for Linux';
			secondary = '.deb · .rpm · AppImage · coming soon';
			href = RELEASES;
		} else {
			primary   = 'See all downloads';
			secondary = 'macOS available · more platforms soon';
			href = RELEASES;
		}

		if (labelEl)     labelEl.textContent    = primary.replace(/^Download /, '');
		if (primaryEl)   primaryEl.textContent   = primary;
		if (secondaryEl) secondaryEl.textContent = secondary;
		if (primaryBtn)  primaryBtn.href         = href || '#';

		if (navDownload) {
			// Top-bar pill gets just "Mac" / "Win" / "Linux"
			const short = os.kind === 'mac' ? 'Download · Mac'
				: os.kind === 'win' ? 'Download · Win'
				: os.kind === 'linux' ? 'Download · Linux'
				: 'Download';
			const labelSpan = navDownload.querySelector('[data-os-label]');
			if (labelSpan) labelSpan.textContent = short;
		}

		// Wire the explicit download cards to stable URLs.
		const pairs = [
			['[data-os-href-mac-arm]', DL['mac-arm']],
			['[data-os-href-mac-x64]', DL['mac-x64']],
		];
		for (const [sel, url] of pairs) {
			const el = document.querySelector(sel);
			if (el) el.href = url;
		}

		// Annotate <html> with the detected OS so CSS could react too.
		document.documentElement.dataset.os = os.kind;
	}

	applyOS(detectOS());

	// -----------------------------------------------------------------
	// Hero sine wave — two stroked paths, one trailing "ghost"
	// -----------------------------------------------------------------
	const waveMain  = document.getElementById('heroWave');
	const waveGhost = document.getElementById('heroWaveGhost');

	if (waveMain && waveGhost) {
		const W = 1200;      // viewBox width
		const H = 400;       // viewBox height
		const cy = H / 2;
		const steps = 140;
		const amp = 64;
		const freq = 2 * Math.PI / 320;

		// Fractal-ish wave: sum of three sines — enough richness that it
		// feels organic without looking like pure noise.
		function sampleAt(x, t) {
			const a = Math.sin(x * freq * 1.00 + t * 0.0018);
			const b = Math.sin(x * freq * 1.71 + t * 0.0009 + 1.3);
			const c = Math.sin(x * freq * 0.37 + t * 0.0005 - 0.7);
			return (a * 0.65 + b * 0.25 + c * 0.35) * amp;
		}

		function buildPath(t, offset = 0) {
			let d = '';
			for (let i = 0; i <= steps; i++) {
				const x = (i / steps) * W;
				const y = cy + sampleAt(x + offset, t + offset);
				d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
			}
			return d;
		}

		let running = true;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

		function tick(t) {
			if (!running) return;
			waveMain.setAttribute('d',  buildPath(t, 0));
			waveGhost.setAttribute('d', buildPath(t - 500, 24));
			requestAnimationFrame(tick);
		}

		if (reduce) {
			waveMain.setAttribute('d',  buildPath(0, 0));
			waveGhost.setAttribute('d', buildPath(0, 24));
		} else {
			requestAnimationFrame(tick);
		}

		// Pause when tab is hidden (saves battery on a laptop).
		document.addEventListener('visibilitychange', () => {
			running = !document.hidden;
			if (running && !reduce) requestAnimationFrame(tick);
		});
	}

	// -----------------------------------------------------------------
	// Scroll-reveal: auto-apply to sections and grid children
	// -----------------------------------------------------------------
	const toReveal = [
		...document.querySelectorAll('.section__head'),
		...document.querySelectorAll('.feature'),
		...document.querySelectorAll('.demo__steps li'),
		...document.querySelectorAll('.providers li'),
		...document.querySelectorAll('.card'),
		...document.querySelectorAll('.faq details'),
		...document.querySelectorAll('.download__title, .download__eyebrow, .download__note'),
		...document.querySelectorAll('.privacy-note'),
		...document.querySelectorAll('.demo__terminal'),
	];
	toReveal.forEach((el, i) => {
		el.classList.add('reveal');
		const delay = (i % 6) + 1;
		el.setAttribute('data-delay', String(delay));
	});

	if ('IntersectionObserver' in window) {
		const io = new IntersectionObserver((entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					e.target.classList.add('is-in');
					io.unobserve(e.target);
				}
			}
		}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
		toReveal.forEach(el => io.observe(el));
	} else {
		toReveal.forEach(el => el.classList.add('is-in'));
	}

	// -----------------------------------------------------------------
	// Topbar shadow once you scroll past the hero
	// -----------------------------------------------------------------
	const topbar = document.querySelector('.topbar');
	if (topbar) {
		const onScroll = () => {
			if (window.scrollY > 12) topbar.classList.add('is-scrolled');
			else topbar.classList.remove('is-scrolled');
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
	}

	// -----------------------------------------------------------------
	// Live latency readout — fakes small fluctuations around a baseline
	// to give the instrument panel a sense of life. Purely decorative.
	// -----------------------------------------------------------------
	const latencyEl = document.querySelector('[data-latency]');
	if (latencyEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
		let base = 120;
		setInterval(() => {
			base += (Math.random() - 0.5) * 8;
			base = Math.max(82, Math.min(168, base));
			latencyEl.textContent = '∼ ' + Math.round(base) + ' ms';
		}, 1600);
	}

	// Footer year
	const yearEl = document.querySelector('[data-year]');
	if (yearEl) yearEl.textContent = String(new Date().getFullYear());

	// -----------------------------------------------------------------
	// Keyboard affordance: "g g" jumps to top, "g d" to download. Small,
	// undocumented easter egg for keyboard users.
	// -----------------------------------------------------------------
	let chord = '';
	let chordTimer = 0;
	window.addEventListener('keydown', (e) => {
		// ignore if user is typing in a field
		const t = e.target;
		if (t && /input|textarea|select/i.test(t.tagName)) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		chord += e.key.toLowerCase();
		clearTimeout(chordTimer);
		chordTimer = setTimeout(() => { chord = ''; }, 700);

		if (chord === 'gg') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
			chord = '';
		} else if (chord === 'gd') {
			const el = document.getElementById('download');
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			chord = '';
		}
	});
})();
