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

	// --- Waitlist (harness.html) -------------------------------------
	// Same-origin endpoint served by nginx on sinweave.com and backed by
	// sinweave-waitlist.service on the droplet. It stores every signup to
	// disk and emails a notification. Same origin, so no CORS needed.
	const WAITLIST_ENDPOINT = '/api/waitlist';

	// Only used if WAITLIST_ENDPOINT is blanked out for local work, so the
	// form is never a dead end. Deliberately not a personal address —
	// this file is public.
	const WAITLIST_EMAIL = 'hello@sinweave.com';

	// Remembers a successful signup so returning visitors aren't asked twice.
	const WAITLIST_KEY = 'sinweave:harness-waitlist';

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
		...document.querySelectorAll('.spec__row'),
		...document.querySelectorAll('.waitlist__title, .waitlist__lede, .waitlist__form'),
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
	// Harness waitlist form
	// Progressive: validates locally, POSTs JSON when an endpoint is
	// configured, and falls back to a pre-filled mail draft when one
	// isn't. Only runs on pages that actually have the form.
	// -----------------------------------------------------------------
	const wlForm = document.getElementById('waitlistForm');

	if (wlForm) {
		const wlInput  = document.getElementById('waitlistEmail');
		const wlButton = document.getElementById('waitlistSubmit');
		const wlMsg    = document.getElementById('waitlistMsg');
		const wlSelect = wlForm.querySelector('[name="use_case"]');
		const wlTrap   = wlForm.querySelector('[name="company"]');

		const ICON_OK = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" stroke="currentColor" fill="none" stroke-width="1.3"/><path d="M5.2 8.2l2 2 3.6-4.4" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		const ICON_ERR = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" stroke="currentColor" fill="none" stroke-width="1.3"/><path d="M8 4.6v4.2M8 11.2v.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

		function say(kind, html) {
			if (!wlMsg) return;
			wlMsg.className = 'waitlist__msg is-shown' + (kind ? ' is-' + kind : '');
			const icon = kind === 'ok' ? ICON_OK : kind === 'error' ? ICON_ERR : '';
			wlMsg.innerHTML = icon + '<span>' + html + '</span>';
		}

		function validEmail(v) {
			// Deliberately loose. The inbox is the real validator.
			return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
		}

		function lock(on) {
			if (wlButton) {
				wlButton.disabled = on;
				wlButton.textContent = on ? 'Sending…' : 'Join waitlist';
			}
			if (wlInput) wlInput.disabled = on;
		}

		function done(email) {
			try { localStorage.setItem(WAITLIST_KEY, email); } catch { /* private mode */ }
			wlForm.querySelector('.waitlist__row').style.display = 'none';
			if (wlSelect) wlSelect.style.display = 'none';
			say('ok', "You're on the list. We'll email <strong>" +
				email.replace(/[<>&]/g, '') + "</strong> when the Harness build is ready.");
		}

		// Returning visitor who already signed up on this browser.
		try {
			const prior = localStorage.getItem(WAITLIST_KEY);
			if (prior) done(prior);
		} catch { /* private mode — just show the form */ }

		wlForm.addEventListener('submit', (e) => {
			e.preventDefault();

			// Bots fill hidden fields; humans can't see this one.
			if (wlTrap && wlTrap.value) return;

			const email = (wlInput && wlInput.value || '').trim();
			const useCase = (wlSelect && wlSelect.value) || '';

			if (!validEmail(email)) {
				say('error', 'That address doesn&rsquo;t look right — mind checking it?');
				if (wlInput) wlInput.focus();
				return;
			}

			const payload = {
				email: email,
				use_case: useCase,
				list: 'harness-waitlist',
				source: location.pathname,
				submitted_at: new Date().toISOString(),
			};

			// No endpoint wired up yet: hand off to the user's mail client
			// so the signup still reaches a human.
			if (!WAITLIST_ENDPOINT) {
				const subject = encodeURIComponent('Harness waitlist');
				const body = encodeURIComponent(
					'Please add me to the SinWeave Harness waitlist.\n\n' +
					'Email: ' + email + '\n' +
					(useCase ? 'Use case: ' + useCase + '\n' : '')
				);
				window.location.href = 'mailto:' + WAITLIST_EMAIL + '?subject=' + subject + '&body=' + body;
				say('ok', 'Opening your mail app to finish the signup. If nothing happens, email <strong>' +
					WAITLIST_EMAIL + '</strong> and we&rsquo;ll add you.');
				return;
			}

			lock(true);
			say('', 'Adding you&hellip;');

			fetch(WAITLIST_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
				body: JSON.stringify(payload),
			})
				.then((res) => {
					if (!res.ok) throw new Error('HTTP ' + res.status);
					done(email);
				})
				.catch(() => {
					lock(false);
					say('error', 'That didn&rsquo;t go through &mdash; try again in a moment.');
				});
		});
	}

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
