/* Dark Path: behavior shared by every page (sound, menus, motion). */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EASE = "cubic-bezier(.2,.7,.2,1)";
  var hasIO = "IntersectionObserver" in window;

  /* ---------- Sound: synthesized in the browser, off until the visitor turns it on ---------- */
  var Sound = (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = null, master, cave, noiseBuf, groups = {}, on = false, mood = "city", siege = 0, timer = null;
    var nextClink = 0, nextDrip = 0, nextBeat = 0, beat = 0, lastPlayed = {};
    var DRUMS = [1, 0, 0.45, 0, 0.8, 0.5, 0, 0.35]; // eighth notes

    function build() {
      ac = new AC();
      var comp = ac.createDynamicsCompressor();
      comp.connect(ac.destination);
      master = ac.createGain(); master.gain.value = 0.0001; master.connect(comp);
      // A short stone-corridor echo
      cave = ac.createDelay(1); cave.delayTime.value = 0.23;
      var feedback = ac.createGain(), caveOut = ac.createGain();
      feedback.gain.value = 0.35; caveOut.gain.value = 0.5;
      cave.connect(feedback); feedback.connect(cave); cave.connect(caveOut); caveOut.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      groups.city = group(); groups.dark = group(); groups.siege = group();
      // City days: calm strings in D minor
      drone(groups.city, [146.83, 220, 349.23], "triangle", "lowpass", 1100, 0.7, 0.045, 0.07);
      // Dungeons: a low drone and a distant choir
      drone(groups.dark, [73.42, 110], "sawtooth", "lowpass", 280, 0.7, 0.05, 0.05);
      drone(groups.dark, [220, 261.63], "sawtooth", "bandpass", 650, 5, 0.12, 0.035);
      // Invasion: a low rumble under the war drums
      drone(groups.siege, [55, 82.41], "sawtooth", "lowpass", 150, 0.7, 0.06, 0.12);
    }
    function group() { var g = ac.createGain(); g.gain.value = 0.0001; g.connect(master); return g; }
    function drone(dest, freqs, type, filterType, cutoff, q, level, lfoRate) {
      var f = ac.createBiquadFilter(), swell = ac.createGain();
      f.type = filterType; f.frequency.value = cutoff; f.Q.value = q; f.connect(dest);
      swell.gain.value = level; swell.connect(f);
      freqs.forEach(function (fr, i) {
        [-5, 5].forEach(function (cents) {
          var o = ac.createOscillator();
          o.type = type; o.frequency.value = fr; o.detune.value = cents + i * 2;
          o.connect(swell); o.start();
        });
      });
      var lfo = ac.createOscillator(), depth = ac.createGain();
      lfo.frequency.value = lfoRate; depth.gain.value = level * 0.6;
      lfo.connect(depth); depth.connect(swell.gain); lfo.start();
    }

    function tone(t, type, f0, f1, glide, peak, decay, dest) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g); g.connect(dest || master);
      o.start(t); o.stop(t + decay + 0.05);
      return g;
    }
    function noise(t, filterType, freq, q, peak, decay) {
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
    }
    function clink(t) { var f = 1700 + Math.random() * 500; tone(t, "triangle", f, 0, 0, 0.035, 0.25); tone(t, "sine", f * 2.71, 0, 0, 0.015, 0.18); }
    function drip(t) { tone(t, "sine", 1500 + Math.random() * 600, 480, 0.09, 0.07, 0.16).connect(cave); }
    function drum(t, v) { tone(t, "sine", 120, 42, 0.22, 0.7 * v, 0.55); noise(t, "lowpass", 900, 0.7, 0.25 * v, 0.12); }

    // Schedules hammer clinks, water drips or war drums a little ahead of time.
    function schedule() {
      var now = ac.currentTime, ahead = now + 0.25;
      if (mood === "city") while (nextClink < ahead) { clink(Math.max(nextClink, now)); nextClink += 1.6 + Math.random() * 3.4; }
      if (mood === "dark") while (nextDrip < ahead) { drip(Math.max(nextDrip, now)); nextDrip += 1.8 + Math.random() * 3.5; }
      if (mood === "siege") {
        var step = 60 / (76 + siege * 64) / 2; // the drums speed up deeper into the Hollow section
        while (nextBeat < ahead) { var v = DRUMS[beat % 8]; if (v) drum(Math.max(nextBeat, now), v); beat++; nextBeat += step; }
      }
    }
    function crossfade() {
      var now = ac.currentTime;
      Object.keys(groups).forEach(function (k) { groups[k].gain.setTargetAtTime(k === mood ? 1 : 0.0001, now, 0.7); });
      nextClink = nextDrip = nextBeat = now + 0.4; beat = 0;
    }
    function throttled(key, ms) {
      var n = performance.now();
      if (lastPlayed[key] && n - lastPlayed[key] < ms) return true;
      lastPlayed[key] = n; return false;
    }

    document.addEventListener("visibilitychange", function () {
      if (!ac || !on) return;
      if (document.hidden) ac.suspend(); else ac.resume();
    });

    return {
      supported: !!AC,
      isOn: function () { return on; },
      setOn: function (v) {
        if (v === on || !AC) return;
        on = v;
        if (on) {
          if (!ac) build();
          ac.resume();
          crossfade();
          master.gain.cancelScheduledValues(ac.currentTime);
          master.gain.setTargetAtTime(0.35, ac.currentTime, 0.3);
          timer = setInterval(schedule, 60);
        } else {
          clearInterval(timer);
          master.gain.cancelScheduledValues(ac.currentTime);
          master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.12);
          setTimeout(function () { if (!on) ac.suspend(); }, 600);
        }
      },
      setMood: function (m) { if (m === mood) return; mood = m; if (on) crossfade(); },
      setSiege: function (v) { siege = v; },
      click: function () { if (on) noise(ac.currentTime, "bandpass", 3200, 1.2, 0.12, 0.035); },
      tick: function () { if (on && !throttled("tick", 70)) tone(ac.currentTime, "square", 1200, 0, 0, 0.012, 0.03); },
      crackle: function () { if (on && !throttled("crackle", 90)) noise(ac.currentTime, "highpass", 2500, 0.7, 0.05, 0.03); },
      // A bell, as when a Decree is signed
      bell: function () {
        if (!on || throttled("bell", 450)) return;
        var t = ac.currentTime;
        [[1, 0.12, 2.6], [2.76, 0.05, 1.6], [5.4, 0.025, 0.9], [8.93, 0.012, 0.5]].forEach(function (p) { tone(t, "sine", 392 * p[0], 0, 0, p[1], p[2]); });
      },
      // The warning horn for a boss or an invasion
      horn: function () {
        if (!on || throttled("horn", 2500)) return;
        var t = ac.currentTime, f = ac.createBiquadFilter(), g = ac.createGain();
        f.type = "lowpass";
        f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(1300, t + 0.6); f.frequency.linearRampToValueAtTime(350, t + 1.8);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.35);
        g.gain.setValueAtTime(0.16, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
        f.connect(g); g.connect(master); g.connect(cave);
        [98, 98.6, 146.8].forEach(function (fr) {
          var o = ac.createOscillator();
          o.type = "sawtooth"; o.frequency.setValueAtTime(fr * 0.97, t); o.frequency.linearRampToValueAtTime(fr, t + 0.3);
          o.connect(f); o.start(t); o.stop(t + 2.1);
        });
      },
      thud: function () { if (!on) return; var t = ac.currentTime; tone(t, "sine", 90, 38, 0.4, 0.5, 0.7); noise(t, "lowpass", 400, 0.7, 0.2, 0.3); },
      // A blade striking a Hollow
      hit: function () { if (!on) return; var t = ac.currentTime; tone(t, "square", 220, 70, 0.12, 0.08, 0.18); noise(t, "bandpass", 1800, 0.8, 0.18, 0.08); },
      // A Bestiary page completed
      chime: function () {
        if (!on || throttled("chime", 300)) return;
        var t = ac.currentTime;
        [659.25, 987.77, 1318.5].forEach(function (f, i) { tone(t + i * 0.07, "triangle", f, 0, 0, 0.06, 0.9).connect(cave); });
      }
    };
  })();

  function riseIn(el, delay) {
    el.animate([{ opacity: 0, transform: "translateY(22px)" }, { opacity: 1, transform: "none" }],
      { duration: 700, delay: delay || 0, easing: EASE, fill: "backwards" });
  }
  // Pixel-font labels type themselves out, one character per step.
  function typeIn(el, delay) {
    var n = Math.max(4, el.textContent.trim().length);
    el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { duration: n * 28, delay: delay || 0, easing: "steps(" + n + ", end)", fill: "backwards" });
  }
  // Pixel sparks fly from anything you press.
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.background = i % 3 ? "var(--ember)" : "var(--flame)";
      document.body.appendChild(s);
      var a = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 36;
      s.animate([
        { transform: "translate(0,0)", opacity: 1 },
        { transform: "translate(" + (Math.cos(a) * dist).toFixed(1) + "px," + (Math.sin(a) * dist + 16).toFixed(1) + "px)", opacity: 0 }
      ], { duration: 450 + Math.random() * 350, easing: EASE }).onfinish = s.remove.bind(s);
    }
  }

  // Shared with page scripts such as home.js.
  window.DP = { reduce: reduce, EASE: EASE, hasIO: hasIO, Sound: Sound, riseIn: riseIn, typeIn: typeIn, burst: burst };

  var topbar = document.querySelector(".topbar"), fuse = document.querySelector(".fuse"), toTop = document.getElementById("to-top");

  // Scroll: the fuse burns along the top bar as you read down the page.
  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
      fuse.style.width = (max > 0 ? Math.min(100, y / max * 100) : 0) + "%";
      fuse.style.opacity = y > 4 ? "1" : "0";
      topbar.classList.toggle("scrolled", y > 8);
      toTop.classList.toggle("show", y > window.innerHeight * 1.2);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Track the section in the middle of the screen: highlight its menu link and set the sound's mood.
  if (hasIO) {
    var menuLinks = Array.prototype.filter.call(document.querySelectorAll(".mmenu a"), function (a) {
      return a.hash && a.pathname === location.pathname;
    });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        menuLinks.forEach(function (a) { a.classList.toggle("active", !!id && a.hash === "#" + id); });
        Sound.setMood(e.target.getAttribute("data-mood") || "city");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("main > section").forEach(function (s) { spy.observe(s); });
  }

  // Page openings rise in on load.
  if (!reduce) {
    document.querySelectorAll(".page-hero .wrap > *").forEach(function (el, i) {
      if (el.classList.contains("eyebrow")) typeIn(el, 100); else riseIn(el, 150 + i * 120);
    });
  }

  // Sections rise in as they scroll into view. Everything is visible at rest;
  // only content still below the fold on load gets an entrance.
  if (!reduce && hasIO) {
    var revealSel = ".section-head > *, .setting > *, .pillar blockquote, .facts > div, .phases > li, .prologue, .ring-map, .bestiary-bar, " +
      ".follow .wrap > *, .front, .city-grid .sub, .table-scroll, .torch-box, .region, .foe, .boss-card, .acts > li, .ending, .hero-card, " +
      ".rules > li, .bonds-title, .bond, .road > li, .specs > div, .post, .devlog-aside, .kit-side, .kit-block, .asset, .faq-group h2, .faq-item";
    var revealIO = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        revealIO.unobserve(e.target);
        var el = e.target, delay = Math.min(n++, 8) * 80;
        if (el.classList.contains("eyebrow")) typeIn(el, delay);
        else if (el.tagName === "H2") el.animate(
          [{ opacity: 0, transform: "translateY(26px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
          { duration: 900, delay: delay, easing: EASE, fill: "backwards" });
        else riseIn(el, delay);
        var bar = el.classList.contains("bond") && el.querySelector(".meter i");
        if (bar) bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 900, delay: delay + 250, easing: EASE, fill: "backwards" });
      });
    }, { rootMargin: "0px 0px 10% 0px" });
    document.querySelectorAll(revealSel).forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) revealIO.observe(el);
    });
  }

  document.addEventListener("pointerdown", function (e) {
    var t = e.target.closest(".btn, .pixel-btn, .topbar nav a, .mark, .chips span, .genres span, .day, kbd, .mmenu a, .menu-btn, .sound-toggle, .ring-tab, #city-map, .foe:not(.stage-3), .to-top, .faq-item summary, .asset .dl, .footer-links a, .faq-nav a, .kit-nav a");
    if (!t) return;
    if (!t.matches(".menu-btn, .sound-toggle, .foe")) Sound.click();
    if (!reduce) burst(e.clientX, e.clientY, t.classList.contains("btn") ? 16 : 9);
  });

  // Pressing a real key pushes down the matching key shown on the page.
  var kbds = Array.prototype.slice.call(document.querySelectorAll("kbd"));
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    var k = e.key === " " ? "Space" : e.key === "Control" ? "Ctrl" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    kbds.forEach(function (el) {
      var label = el.textContent, range = /^(\d)-(\d)$/.exec(label);
      var hit = label === k || (range && /^\d$/.test(k) && +k >= +range[1] && +k <= +range[2]);
      if (!hit) return;
      el.classList.add("down");
      setTimeout(function () { el.classList.remove("down"); }, 160);
    });
  });

  /* ---------- Sound toggle ---------- */
  var soundBtn = document.getElementById("sound-toggle"), soundLabel = soundBtn.querySelector(".sound-label");
  if (!Sound.supported) soundBtn.hidden = true;
  soundBtn.addEventListener("click", function () {
    var v = !Sound.isOn();
    Sound.setOn(v);
    soundBtn.setAttribute("aria-pressed", String(v));
    soundLabel.textContent = v ? "Sound on" : "Sound off";
    if (v) Sound.click();
  });

  /* ---------- Phone menu ---------- */
  var menuBtn = document.getElementById("menu-btn"), mmenu = document.getElementById("mmenu");
  var behindMenu = [document.querySelector("main"), document.querySelector("footer")];
  function setMenu(open, refocus) {
    mmenu.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.documentElement.style.overflow = open ? "hidden" : "";
    behindMenu.forEach(function (el) { el.inert = open; });
    if (open) setTimeout(function () { mmenu.querySelector("a").focus({ preventScroll: true }); }, 60);
    else if (refocus) menuBtn.focus();
    Sound.click();
  }
  menuBtn.addEventListener("click", function () { setMenu(!mmenu.classList.contains("open")); });
  mmenu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mmenu.classList.contains("open")) setMenu(false, true);
  });
  var phoneWidth = window.matchMedia("(max-width: 760px)");
  var onWidth = function (m) { if (!m.matches && mmenu.classList.contains("open")) setMenu(false); };
  if (phoneWidth.addEventListener) phoneWidth.addEventListener("change", onWidth); else phoneWidth.addListener(onWidth);

  /* ---------- Back to top ---------- */
  document.querySelectorAll('a[href="#top"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (mmenu.classList.contains("open")) setMenu(false);
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  });

  /* ---------- Follow link ---------- */
  // Paste an itch.io or Discord link here to send the home page's Follow button there instead of GitHub.
  var FOLLOW_URL = "";
  var followLink = document.getElementById("follow-link");
  if (FOLLOW_URL && followLink) {
    followLink.href = FOLLOW_URL;
    followLink.textContent = "Follow development";
  }
})();
