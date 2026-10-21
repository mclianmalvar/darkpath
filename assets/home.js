/* Dark Path: the home page's scenes and interactive pieces. Needs site.js first. */
(function () {
  "use strict";
  var DP = window.DP, reduce = DP.reduce, Sound = DP.Sound, EASE = DP.EASE, hasIO = DP.hasIO;
  var riseIn = DP.riseIn, typeIn = DP.typeIn;
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- Countdown strip ---------- */
  var cd = document.getElementById("countdown"), readout = document.getElementById("day-readout");
  function dayInfo(d) {
    if (d === 1) return ["Day 1", "First act only: the Hollow attack before you have built anything."];
    if (d === 25) return ["Day 25", "Scout report: the monster types, Omens, arrival time and weather."];
    if (d === 30) return ["Day 30", "The last day. Anything still under construction won't be ready for the invasion."];
    if (d === 31) return ["Invasion", "Three waves and a boss, in real time. The Hollow may come at dawn, noon, dusk or night."];
    return ["Day " + d, "One city turn: build, research or pass a Decree. Heroes can leave on a 1 to 3 day expedition."];
  }
  for (var d = 1; d <= 31; d++) {
    var c = document.createElement("button");
    var info = dayInfo(d);
    c.type = "button";
    c.className = "day" + (d === 1 ? " pro" : "") + (d === 25 ? " scout" : "") + (d === 31 ? " inv" : "");
    c.textContent = d === 31 ? "☠" : d;
    c.dataset.day = d;
    c.setAttribute("aria-label", info[0] + ": " + info[1]);
    cd.appendChild(c);
  }
  function showDay(btn) {
    var info = dayInfo(+btn.dataset.day);
    cd.querySelectorAll(".sel").forEach(function (x) { x.classList.remove("sel"); });
    btn.classList.add("sel");
    readout.innerHTML = "<b></b><span></span>";
    readout.firstChild.textContent = info[0];
    readout.lastChild.textContent = info[1];
    if (!reduce) readout.animate([{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  }
  ["mouseover", "focusin", "click"].forEach(function (ev) {
    cd.addEventListener(ev, function (e) {
      var b = e.target.closest(".day");
      if (b && !b.classList.contains("sel")) { showDay(b); Sound.tick(); }
    });
  });
  showDay(cd.firstChild);

  /* ---------- Greywatch map ---------- */
  var RINGS = [
    { name: "Inner Keep", pos: "Ring 1 · the heart",
      text: "The Warden's seat and the city's last refuge. When you evacuate the Market Ring, its citizens walk here. Shelters to hold them are planned for the full game.",
      fall: "If the Hollow reach the Keep's heart, Greywatch falls and the campaign ends." },
    { name: "Market Ring", pos: "Ring 2",
      text: "Where the Prologue's Brutes strike the gate. Hold the walls on Day 1 and the Market Ring stays open.",
      fall: "Lose the Prologue and it falls on Day 1. Its buildings stop working until you reclaim it during Act 1." },
    { name: "Farm Ring", pos: "Ring 3",
      text: "The fields north of the walls. From Act 2 you can retake them: the farmers come home, buildings go up in the fields, and Farms there yield half again as much.",
      fall: "It lies outside the walls, in the Hollow's way, so its walls are yours to build. Burn the Outskirts burns every building in it to close the east track." },
    { name: "Outer Wall", pos: "Ring 4 · the first line",
      text: "The North gate faces the main road, a branch of it leads to the North-west gate, and the East gate faces the flank track. The North wall is two tiles thick, so units walk along it and pass each other. Towers built on top of the walls get +1 range, and units reach the walkway only by the wall stairs.",
      fall: "Brutes and Gravemaw smash walls and gates, and every blow shakes the defenders standing on them. A tower on a wall falls with it, defenders on a breaking wall fall to the ground, and every destroyed section becomes a ruin you must clear and rebuild." }
  ];
  var mapCv = document.getElementById("city-map"), mg = mapCv.getContext("2d"), mapTip = document.getElementById("map-tip");
  var ringInfo = document.getElementById("ring-info"), ringTabs = Array.prototype.slice.call(document.querySelectorAll(".ring-tab"));
  var MW = 160, MH = 120, MCX = 80, MCY = 88, RADII = [11, 24, 38, 50];
  var HORDE = [[8, 2], [4, 1], [6, 2]]; // per lane: walkers, and how many crowds they come in
  function frac(v) { return v - Math.floor(v); }
  var ringAt = new Int8Array(MW * MH), mapBase, ringBase = [], ringEdge = [], lanes = [], towers = [];
  var selRing = 0, hoverRing = -1, selAt = 0;
  mapCv.width = MW; mapCv.height = MH;

  function ringShape(t) { return 1 + 0.05 * Math.sin(3 * t + 0.5) + 0.03 * Math.sin(7 * t + 2); }
  function coastY(x) { return 104 + 3 * Math.sin(x * 0.11) + 2 * Math.sin(x * 0.29); }

  function buildMap() {
    var r = rng(2024);
    mapBase = document.createElement("canvas"); mapBase.width = MW; mapBase.height = MH;
    var g = mapBase.getContext("2d");
    function px(x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    var ROOFS = ["#3d2b23", "#46322a", "#352720"];
    for (var y = 0; y < MH; y++) {
      for (var x = 0; x < MW; x++) {
        var dx = x - MCX, dy = y - MCY, t = Math.atan2(dy, dx), d = Math.hypot(dx, dy) / ringShape(t);
        var sea = y >= coastY(x);
        var ring = sea ? -1 : d < RADII[0] ? 0 : d < RADII[1] ? 1 : d < RADII[2] ? 2 : d < RADII[3] ? 3 : -1;
        ringAt[y * MW + x] = ring;
        var c;
        if (sea) c = y < coastY(x) + 1.5 ? "#2a3a4f" : (y % 3 === 0 ? "#0d1320" : "#0b1018");
        else if (ring === -1 && (x < 18 || x > MW - 19) && r() < 0.6) c = r() < 0.5 ? "#16201a" : "#1c2a21"; // forest on both flanks
        else if (ring === -1) c = r() < 0.04 ? "#1c2230" : ((x + y) % 2 ? "#12161e" : "#141922");
        else if (ring === 3) c = d > RADII[3] - 1.2 ? "#5b6476" : d > RADII[3] - 4 ? "#3d4555" : "#171c25";
        else if (ring === 2) {
          var sector = Math.floor((t + Math.PI) / (Math.PI / 4));
          var stripe = Math.floor((sector % 2 ? x + y : x - y + 200) / 2) % 2;
          c = d > RADII[2] - 1 ? "#2e3542" : sector % 3 === 0 ? (stripe ? "#2a2620" : "#2f2a22") : (stripe ? "#262c1c" : "#2d3421");
        }
        else if (ring === 1) {
          if (d > RADII[1] - 1) c = "#343c4b";
          else if (x % 5 === 0 || y % 4 === 0) c = "#161a22";
          else c = r() < 0.04 ? "#d98a3a" : ROOFS[(Math.floor(x / 5) * 7 + Math.floor(y / 4) * 3) % 3];
        }
        else c = d > RADII[0] - 1 ? "#3d4555" : "#20252f";
        px(x, y, c);
      }
    }
    // Invasion lanes from the north edge: the main road straight down to the North gate,
    // a branch of it to the North-west gate, and the flank track down the east side to the East gate.
    lanes = [[[80, 0]], [[80, 0], [80, 27], [63, 33]], [[126, 0], [143, 26], [146, 70]]].map(function (way) {
      var pts = [], path = way.concat([[MCX, MCY]]), done = false;
      for (var s = 0; s < path.length - 1 && !done; s++) {
        var ax = path[s][0], ay = path[s][1], bx = path[s + 1][0], by = path[s + 1][1], len = Math.hypot(bx - ax, by - ay);
        for (var k = 0; k <= len; k++) {
          var f = k / len;
          var lx = Math.max(0, Math.min(MW - 2, Math.round(ax + (bx - ax) * f + Math.sin(pts.length * 0.2) * 1.2)));
          var ly = Math.round(ay + (by - ay) * f);
          if (ringAt[ly * MW + lx] !== -1) { done = true; break; }
          pts.push([lx, ly]);
          px(lx, ly, "#1f242e"); px(lx + 1, ly, "#1f242e");
        }
      }
      var gate = pts[pts.length - 1];
      g.fillStyle = "#2b1a12"; g.fillRect(gate[0] - 1, gate[1], 3, 3);
      return pts;
    });
    // Towers along the wall
    towers = [];
    for (var a = 0; a < 15; a++) {
      var ta = a / 15 * Math.PI * 2, R = (RADII[3] - 2.5) * ringShape(ta);
      var tx = Math.round(MCX + Math.cos(ta) * R) - 1, ty = Math.round(MCY + Math.sin(ta) * R) - 1;
      if (ty + 3 >= coastY(tx)) continue;
      g.fillStyle = "#4a5262"; g.fillRect(tx, ty, 3, 3);
      g.fillStyle = "#5b6476"; g.fillRect(tx, ty, 3, 1);
      towers.push({ x: tx, y: ty });
    }
    // The keep and its banner
    g.fillStyle = "#2b303b"; g.fillRect(MCX - 5, MCY - 5, 10, 10);
    g.fillStyle = "#4a5160"; g.fillRect(MCX - 4, MCY - 4, 8, 8);
    g.fillStyle = "#565e6f"; g.fillRect(MCX - 3, MCY - 3, 6, 6);
    g.fillStyle = "#2b303b"; g.fillRect(MCX, MCY - 9, 1, 6);
    g.fillStyle = "#ef7b31"; g.fillRect(MCX + 1, MCY - 9, 3, 2);

    // Per-ring copies of the map and their outlines, for highlighting
    var data = g.getImageData(0, 0, MW, MH).data;
    for (var i = 0; i < 4; i++) {
      var rb = document.createElement("canvas"), ec = document.createElement("canvas");
      rb.width = ec.width = MW; rb.height = ec.height = MH;
      var rgc = rb.getContext("2d"), img = rgc.createImageData(MW, MH), eg = ec.getContext("2d");
      eg.fillStyle = "#ef7b31";
      for (var p = 0; p < MW * MH; p++) {
        if (ringAt[p] !== i) continue;
        img.data[p * 4] = data[p * 4]; img.data[p * 4 + 1] = data[p * 4 + 1]; img.data[p * 4 + 2] = data[p * 4 + 2]; img.data[p * 4 + 3] = 255;
        var ex = p % MW, ey = (p / MW) | 0;
        if (ex === 0 || ey === 0 || ex === MW - 1 || ey === MH - 1 ||
            ringAt[p - 1] !== i || ringAt[p + 1] !== i || ringAt[p - MW] !== i || ringAt[p + MW] !== i) eg.fillRect(ex, ey, 1, 1);
      }
      rgc.putImageData(img, 0, 0);
      ringBase[i] = rb; ringEdge[i] = ec;
    }
  }

  function drawMap(t) {
    mg.drawImage(mapBase, 0, 0);
    mg.fillStyle = "rgba(8,10,15,0.5)"; mg.fillRect(0, 0, MW, MH);
    if (hoverRing >= 0 && hoverRing !== selRing) { mg.globalAlpha = 0.6; mg.drawImage(ringBase[hoverRing], 0, 0); }
    var fade = reduce ? 1 : Math.min(1, (t - selAt) / 300);
    mg.globalAlpha = fade; mg.drawImage(ringBase[selRing], 0, 0);
    mg.globalAlpha = fade * (reduce ? 1 : 0.65 + 0.35 * Math.sin(t * 0.005)); mg.drawImage(ringEdge[selRing], 0, 0);
    mg.globalAlpha = 1;
    towers.forEach(function (tw, i) {
      mg.fillStyle = reduce || Math.sin(t * 0.01 + i * 1.9) > -0.3 ? "#ef7b31" : "#9c4519";
      mg.fillRect(tw.x + 1, tw.y - 1, 1, 1);
    });
    // The Hollow march down the lanes toward the gates: loose crowds, each one off to its own side
    mg.fillStyle = "#e2dccf";
    lanes.forEach(function (lane, li) {
      var n = HORDE[li][0], crowds = HORDE[li][1], last = lane.length - 1;
      for (var k = 0; k < n; k++) {
        var h1 = frac(Math.sin(k * 12.9898 + li * 78.233) * 43758.5453), h2 = frac(h1 * 91.7 + k * 0.37);
        var at = (k % crowds + 0.5) / crowds + (h2 - 0.5) * 0.12;
        var prog = frac(reduce ? at : t * 0.00006 * (1 + li * 0.2) + at + li * 0.13);
        var i = Math.floor(prog * last), p = lane[i], q = lane[Math.min(last, i + 2)], o = lane[Math.max(0, i - 2)];
        var dx = q[0] - o[0], dy = q[1] - o[1], dl = Math.hypot(dx, dy) || 1;
        var side = (h1 - 0.5) * 5 + (reduce ? 0 : Math.sin(t * 0.002 + k * 1.7) * 0.6);
        var x = Math.round(p[0] - dy / dl * side), y = Math.round(p[1] + dx / dl * side);
        if (x < 0 || x >= MW || y < 0 || y >= MH || ringAt[y * MW + x] !== -1) { x = p[0]; y = p[1]; }
        mg.fillRect(x, y, 1, 1);
      }
    });
  }

  function selectRing(i, animate) {
    selRing = i; selAt = performance.now();
    ringTabs.forEach(function (b, k) { b.setAttribute("aria-selected", String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    ringInfo.setAttribute("aria-labelledby", "ring-tab-" + i);
    var R = RINGS[i];
    ringInfo.querySelector(".ring-pos").textContent = R.pos;
    ringInfo.querySelector("h3").textContent = R.name;
    ringInfo.querySelector(".ring-text").textContent = R.text;
    ringInfo.querySelector(".ring-fall span").textContent = R.fall;
    if (animate && !reduce) ringInfo.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "ease-out" });
    drawMap(performance.now());
  }
  function ringFromEvent(e) {
    var r = mapCv.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * MW), y = Math.floor((e.clientY - r.top) / r.height * MH);
    return x < 0 || y < 0 || x >= MW || y >= MH ? -1 : ringAt[y * MW + x];
  }
  mapCv.addEventListener("pointermove", function (e) {
    var ring = ringFromEvent(e), fr = mapCv.getBoundingClientRect();
    if (ring !== hoverRing) { hoverRing = ring; mapCv.style.cursor = ring >= 0 ? "pointer" : "default"; drawMap(performance.now()); }
    mapTip.hidden = ring < 0;
    if (ring >= 0) {
      mapTip.textContent = RINGS[ring].name;
      mapTip.style.left = (e.clientX - fr.left) + "px";
      mapTip.style.top = (e.clientY - fr.top) + "px";
    }
  });
  mapCv.addEventListener("pointerleave", function () { hoverRing = -1; mapTip.hidden = true; drawMap(performance.now()); });
  mapCv.addEventListener("click", function (e) { var ring = ringFromEvent(e); if (ring >= 0 && ring !== selRing) selectRing(ring, true); });
  ringTabs.forEach(function (b, i) {
    b.addEventListener("click", function () { if (i !== selRing) selectRing(i, true); });
    b.addEventListener("keydown", function (e) {
      var step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var n = (selRing + step + RINGS.length) % RINGS.length;
      selectRing(n, true); ringTabs[n].focus();
    });
  });
  buildMap();
  selectRing(0, false);
  if (!reduce && "IntersectionObserver" in window) {
    var mapVisible = false, lastM = 0;
    new IntersectionObserver(function (es) { mapVisible = es[0].isIntersecting; }).observe(mapCv);
    (function mloop(t) {
      if (mapVisible && t - lastM > 100) { lastM = t; drawMap(t); }
      requestAnimationFrame(mloop);
    })(0);
  }

  /* ---------- Hollow Bestiary: each hunt reveals more, as kills do in the game ---------- */
  // 12x12 sprites: "#" ash and bone, "+" the glowing cracks.
  var SPRITES = {
    "Husk":        ["....####....", "...######...", "...#+##+#...", "....####....", "...######...", "..##+####...", "..#.####.#..", "....#++#....", "....####....", "....#..#....", "...##..##...", "............"],
    "Runner":      ["......###...", ".....####...", ".....#+#....", "....####....", "...####.....", "..#.###.....", "....#+#.....", "....####....", "...##..#....", "..##....#...", ".##......#..", "............"],
    "Brute":       ["....####....", "...######...", ".##########.", "############", "##+######+##", "############", "#.###++###.#", "#.########.#", "..###..###..", "..###..###..", ".####..####.", "............"],
    "Spitter":     ["............", "..######....", ".########...", ".##+++####..", ".########...", "..######....", "...#####....", "..###+###...", "..#######...", "...#...#....", "..##...##...", "............"],
    "Gloomwing":   ["............", "#..........#", "##........##", "###..##..###", "####+##+####", ".##########.", "..###++###..", "....####....", ".....##.....", ".....#......", "............", "............"],
    "Burrower":    ["............", "............", "............", "....####....", "...#+##+#...", "..########..", ".#.######.#.", "#..######..#", "############", "#+##+###+###", "############", "............"],
    "Shrieker":    ["....####....", "...#+##+#...", "...######...", "....#++#....", "..#.####.#..", ".#..####..#.", "....####....", "....#..#....", "....#..#....", "...##..##...", "............", "............"],
    "Mimic":       ["....####....", "...######...", "...##+###...", "...######...", "..########..", "..########..", "..###+####..", "..########..", "..########..", "...######...", "...#....#...", "............"],
    "Climber":     ["#....##....#", ".#..####..#.", "..#.#++#.#..", "...######...", "..########..", ".#.######.#.", "#...####...#", "...##..##...", "..#......#..", ".#........#.", "............", "............"],
    "Ram":         ["............", "##..........", "#+#.........", "#####.......", ".##########.", ".###+###+###", ".###########", "..##########", "..##.##.##.#", "..##.##.##..", "............", "............"],
    "Bile Mortar": [".....####...", "....######..", "...###++###.", "...########.", "..#########.", ".##+####....", ".#######....", "..######....", "..##..##....", ".###..###...", "............", "............"]
  };
  var KILLS = [0, 1, 10, 25];
  var foes = [
    ["Husk", "Swarm", "Slow and weak. Arrives in large groups.", "Flame Pit, Catapult", true],
    ["Runner", "Fast", "Sprints past slow towers.", "Frost Bell, Spearmen", true],
    ["Brute", "Tank", "Smashes walls and barricades. Its blows shake the defenders on the wall.", "Ballista, Shieldbearers", true],
    ["Spitter", "Ranged", "Stops a few tiles off and spits bile at defenders, on the walls too, and at towers.", "Archer Post, Sera", true],
    ["Gloomwing", "Flyer", "Flies over walls and hunts the defenders standing on them.", "Archer Post, Arcane Spire", true],
    ["Burrower", "Tunneler", "Tunnels under walls and gates, out of reach, and comes up inside.", "A squad waiting behind the walls", true],
    ["Shrieker", "Support", "Shields the Hollow around it and hurries them on.", "Ballista, kill it first", true],
    ["Mimic", "Trick", "Hides among refugees you take in, and turns on the Market Ring from inside the walls.", "Vael, Spearmen", true],
    ["Climber", "Siege beast", "Scales walls and gates, striking the defenders on the walkway as it goes over.", "Archer Posts and Spearmen on the walls", true],
    ["Ram", "Siege beast", "Heavily armored. Goes for the gates and deals them triple damage.", "Ballista, and Bram in the gateway", true],
    ["Bile Mortar", "Siege beast", "Lobs bile at towers from beyond their reach, then at the walls.", "Catapult, or a hero sortie", true]
  ];
  var roster = document.getElementById("roster");
  var bestCount = document.getElementById("bestiary-count"), bestMeter = document.getElementById("bestiary-meter");
  var revealAllBtn = document.getElementById("reveal-all"), resetBtn = document.getElementById("reset-bestiary");
  var stages = foes.map(function () { return 0; });
  try {
    var savedStages = JSON.parse(localStorage.getItem("darkpath-bestiary") || "null");
    if (Array.isArray(savedStages) && savedStages.length === foes.length) stages = savedStages.map(function (s) { return Math.max(0, Math.min(3, s | 0)); });
  } catch (e) { /* storage unavailable: start fresh */ }

  function drawSprite(cv, rows, lit) {
    var g = cv.getContext("2d");
    g.clearRect(0, 0, 12, 12);
    rows.forEach(function (row, y) {
      for (var x = 0; x < 12; x++) {
        if (row[x] === ".") continue;
        g.fillStyle = !lit ? "#353d4c" : row[x] === "+" ? "#ef7b31" : y > 8 ? "#b8b0a2" : "#e2dccf";
        g.fillRect(x, y, 1, 1);
      }
    });
  }
  var cards = foes.map(function (f) {
    var el = document.createElement("article");
    el.className = "foe" + (f[1] === "Siege beast" ? " beast" : "");
    el.innerHTML = '<div class="foe-top"><canvas class="sprite" width="12" height="12" aria-hidden="true"></canvas><div class="foe-id"><h3></h3><span class="type"></span><span class="state"></span></div></div>' +
      '<p class="desc"></p><p class="counter"><b>Counters</b><span></span></p>' +
      '<div class="hunt"><span class="pips" aria-hidden="true"><i></i><i></i><i></i></span><span class="kills"></span><button type="button" class="hunt-btn"></button></div>';
    roster.appendChild(el);
    return el;
  });
  function renderFoe(i, animate) {
    var f = foes[i], s = stages[i], el = cards[i], next = KILLS[s + 1];
    var name = el.querySelector("h3"), type = el.querySelector(".type"), desc = el.querySelector(".desc");
    var ctr = el.querySelector(".counter span"), btn = el.querySelector(".hunt-btn");
    el.classList.remove("stage-0", "stage-1", "stage-2", "stage-3");
    el.classList.add("stage-" + s);
    drawSprite(el.querySelector(".sprite"), SPRITES[f[0]], s >= 1);
    name.textContent = s >= 1 ? f[0] : "???";
    type.textContent = s >= 2 ? f[1] : "Type unknown";
    desc.textContent = s >= 1 ? f[2] : "An unknown Hollow. Kill one to learn what it is.";
    ctr.textContent = s >= 3 ? f[3] : "Unknown";
    name.classList.toggle("unk", s < 1); type.classList.toggle("unk", s < 2);
    desc.classList.toggle("unk", s < 1); ctr.classList.toggle("unk", s < 3);
    el.querySelectorAll(".pips i").forEach(function (p, k) { p.classList.toggle("on", k < s); });
    var st = el.querySelector(".state");
    st.textContent = f[4] ? "In the current build" : "Planned";
    st.classList.toggle("planned", !f[4]);
    el.querySelector(".kills").textContent = KILLS[s] + (KILLS[s] === 1 ? " kill" : " kills");
    btn.textContent = s >= 3 ? "Studied" : "Hunt";
    btn.disabled = s >= 3;
    btn.setAttribute("aria-label", s >= 3 ? f[0] + ": studied" : "Hunt " + (s >= 1 ? f[0] : "an unknown monster") + " to reach " + next + (next === 1 ? " kill" : " kills"));
    if (animate && !reduce) {
      [s === 1 && name, s === 1 && desc, s === 2 && type, s === 3 && ctr].forEach(function (n) {
        if (n) n.animate([{ opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 450, easing: "ease-out" });
      });
      el.querySelector(".sprite").animate([{ filter: "brightness(3)" }, { filter: "brightness(1)" }], { duration: 350, easing: "ease-out" });
    }
  }
  function updateBestiary() {
    var done = stages.filter(function (s) { return s >= 3; }).length;
    bestCount.textContent = done + " of " + foes.length + " studied";
    bestMeter.style.width = (stages.reduce(function (a, s) { return a + s; }, 0) / (foes.length * 3) * 100).toFixed(1) + "%";
    revealAllBtn.disabled = done === foes.length;
    resetBtn.hidden = stages.every(function (s) { return s === 0; });
    try { localStorage.setItem("darkpath-bestiary", JSON.stringify(stages)); } catch (e) { /* not saved; fine */ }
  }
  function hunt(i, x, y) {
    if (stages[i] >= 3) return;
    var gained = KILLS[stages[i] + 1] - KILLS[stages[i]], el = cards[i];
    stages[i]++;
    renderFoe(i, true);
    updateBestiary();
    if (stages[i] >= 3) Sound.chime(); else Sound.hit();
    if (reduce) return;
    el.animate([{ transform: "none" }, { transform: "translate(-3px,1px)" }, { transform: "translate(3px,-1px)" }, { transform: "none" }], { duration: 220 });
    var r = el.getBoundingClientRect(), pop = document.createElement("span");
    pop.className = "kill-pop";
    pop.textContent = "+" + gained + (gained === 1 ? " kill" : " kills");
    pop.style.left = ((x == null ? r.width / 2 : x - r.left) - 24) + "px";
    pop.style.top = ((y == null ? r.height / 2 : y - r.top) - 14) + "px";
    el.appendChild(pop);
    pop.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-34px)" }], { duration: 800, easing: "ease-out" }).onfinish = pop.remove.bind(pop);
  }
  cards.forEach(function (el, i) {
    el.addEventListener("click", function (e) {
      var byKey = e.detail === 0; // the Hunt button pressed from the keyboard
      hunt(i, byKey ? null : e.clientX, byKey ? null : e.clientY);
    });
    renderFoe(i, false);
  });
  revealAllBtn.addEventListener("click", function () {
    var n = 0;
    stages.forEach(function (s, i) {
      if (s >= 3) return;
      setTimeout(function () { stages[i] = 3; renderFoe(i, true); updateBestiary(); }, reduce ? 0 : n++ * 70);
    });
    Sound.chime();
  });
  resetBtn.addEventListener("click", function () {
    stages = stages.map(function () { return 0; });
    cards.forEach(function (el, i) { renderFoe(i, false); });
    updateBestiary();
    revealAllBtn.focus();
  });
  updateBestiary();

  /* ---------- Cast ---------- */
  var cast = [
    ["Rook Varrel", "The Warden · you", "Cold, practical, quietly guilty. Stays in the city.", "Overclock", "doubles one tower's fire rate for 10 s.", "#ef7b31", true, ""],
    ["Sera Quill", "Archer captain", "Loyal and sharp-tongued.", "Rain of Shafts", "arrows rain on an area for 2 s, hitting flyers too.", "#c9a45a", true, "In the city: +6 Food a day from hunting the cliffs."],
    ["Bram Holt", "Blacksmith · tank", "Huge, gentle, slow to anger.", "Shieldwall", "holds his ground for 8 s, takes 70% less damage and pulls monsters onto himself.", "#8c9db3", true, "In the city: damaged towers and walls regain 25% health a day."],
    ["Isolde Fen", "Hedge witch · mage", "Curious and reckless.", "Frostfire", "freezes a group, then burns it.", "#93b6d8", false, ""],
    ["Mother Ilse", "Priestess · support", "Warm and stubborn.", "Vigil", "heals heroes and lowers Dread.", "#e6d7a8", false, ""],
    ["Habyr", "Lone dungeon-diver", "18, from the burned village of Sabali. Grim, quiet, driven by revenge. Found alone in the Old Mines on the first expedition.", "Hatred", "grows stronger as he fights: in the dungeon with every blow he lands, in battle (G) with every kill.", "#b5432a", true, "In the city: +5 Stone a day from the old seams of the mines."],
    ["Tomas Reed", "Leader of Greywatch · your advisor", "Nervous, and brilliant with numbers. The man who chose you as Warden.", "", "Brings the dawn report and advises you every day.", "#7fa37a", true, ""],
    ["Vael", "Hollow-touched scout", "Silent, half-monster, and loyal.", "", "Brings warning of each invasion.", "#ebe5d8", true, ""],
    ["Cassian Mare", "Rival", "Charming and ambitious. Works against the Warden.", "", "Undermines morale and Decrees.", "#9a7bb5", true, ""],
    ["The Unmade King", "Final antagonist", "The old king of Veyra, reborn in the Maw. Leads the last invasion.", "Invasion IV", "the final boss: his crown breaks at 60% health, and at 25% he is unmade.", "#ebe5d8", true, ""]
  ];
  var castEl = document.getElementById("cast-list");
  cast.forEach(function (h, i) {
    var el = document.createElement("article");
    el.className = "hero-card" + (i === cast.length - 1 ? " foe-card" : "");
    el.innerHTML = '<canvas class="sigil" width="14" height="14" aria-hidden="true"></canvas><div><h3></h3><span class="role"></span><p class="who"></p><p class="ability"><b></b> <span></span></p><p class="city"></p><span class="state"></span></div>';
    el.querySelector("h3").textContent = h[0];
    el.querySelector(".role").textContent = h[1];
    el.querySelector(".who").textContent = h[2];
    el.querySelector(".ability b").textContent = h[3];
    el.querySelector(".ability span").textContent = h[4];
    el.querySelector(".city").textContent = h[7];
    el.querySelector(".state").textContent = h[6] ? "In the current build" : "Planned";
    el.querySelector(".state").classList.toggle("planned", !h[6]);
    drawSigil(el.querySelector("canvas"), h[0], h[5], i === cast.length - 1);
    castEl.appendChild(el);
  });

  // A small mirrored pixel crest per character, seeded by name.
  function drawSigil(cv, name, color, hollow) {
    var g = cv.getContext("2d"), seed = 0;
    for (var k = 0; k < name.length; k++) seed = (seed * 31 + name.charCodeAt(k)) | 0;
    var r = rng(seed);
    g.fillStyle = "#080a0f"; g.fillRect(0, 0, 14, 14);
    for (var y = 2; y < 12; y++) {
      for (var x = 2; x < 7; x++) {
        if (r() < 0.5) {
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1); g.fillRect(13 - x, y, 1, 1);
        }
      }
    }
    if (hollow) { // glowing cracks
      g.fillStyle = "#ef7b31";
      [[6,4],[7,5],[6,6],[7,7],[6,8]].forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); });
    }
  }

  /* ---------- Hero scene: Greywatch on the cliff, the Maw above ---------- */
  var cv = document.getElementById("scene"), ctx = cv.getContext("2d");
  var PX = 4, W, H, base, fires = [], windows = [], embers = [], marchers = [], maw;

  function buildScene() {
    var r = rng(1337);
    W = Math.max(80, Math.round(cv.clientWidth / PX));
    H = Math.max(60, Math.round(cv.clientHeight / PX));
    cv.width = W; cv.height = H;
    base = document.createElement("canvas"); base.width = W; base.height = H;
    var g = base.getContext("2d");
    var narrow = cv.clientWidth < 640;

    var seaY = Math.round(H * (narrow ? 0.93 : 0.86));
    var cliffTop = Math.round(H * (narrow ? 0.86 : 0.66));
    var cliffX = Math.round(W * (narrow ? 0.05 : 0.48));
    maw = { x: Math.round(W * (narrow ? 0.82 : 0.87)), y: Math.round(H * (narrow ? 0.7 : 0.26)), h: Math.round(H * (narrow ? 0.1 : 0.3)) };

    // Sky: banded, dithered gradient
    var sky = ["#07090e", "#0a0d14", "#0d1119", "#11161f", "#151a25", "#1a1f2b"];
    for (var y = 0; y < seaY; y++) {
      var t = y / seaY * (sky.length - 1), i0 = Math.floor(t), f = t - i0;
      for (var x = 0; x < W; x++) {
        var pick = ((x + y) % 2 === 0 ? f > 0.33 : f > 0.66) ? i0 + 1 : i0;
        g.fillStyle = sky[Math.min(pick, sky.length - 1)];
        g.fillRect(x, y, 1, 1);
      }
    }
    // Stars
    for (var s = 0; s < W * H / 90; s++) {
      g.fillStyle = r() < 0.2 ? "#5d6677" : "#323a49";
      g.fillRect(Math.floor(r() * W), Math.floor(r() * seaY * 0.7), 1, 1);
    }
    // Maw glow
    var glow = g.createRadialGradient(maw.x, maw.y, 0, maw.x, maw.y, maw.h * 1.6);
    glow.addColorStop(0, "rgba(239,123,49,0.35)"); glow.addColorStop(0.5, "rgba(156,69,25,0.12)"); glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    // Distant ash plains on the left horizon
    var plainY = Math.round(H * (narrow ? 0.8 : 0.72));
    for (var x2 = 0; x2 < W; x2++) {
      var hh = plainY + Math.round(Math.sin(x2 * 0.09) * 1.5 + Math.sin(x2 * 0.023) * 2);
      g.fillStyle = "#121722"; g.fillRect(x2, hh, 1, seaY - hh);
    }

    // Sea
    for (var y3 = seaY; y3 < H; y3++) {
      g.fillStyle = y3 % 3 === 0 ? "#0b1018" : "#090d14";
      g.fillRect(0, y3, W, 1);
    }

    // Cliff
    var cliffEdge = [];
    for (var y4 = cliffTop; y4 < H; y4++) {
      var e = cliffX + Math.round((y4 - cliffTop) * -0.25 + Math.sin(y4 * 0.7) * 1.5 + r() * 1.5);
      cliffEdge.push(e);
      g.fillStyle = "#06080c"; g.fillRect(e, y4, W - e, 1);
      g.fillStyle = "#1b2130"; g.fillRect(e, y4, 1, 1);
    }

    // City silhouette
    windows = []; fires = [];
    var wallTop = cliffTop - Math.max(4, Math.round(H * 0.035));
    var x0 = cliffX + 2, x1 = W;
    g.fillStyle = "#0c0f16"; g.fillRect(x0, wallTop, x1 - x0, cliffTop - wallTop + 1);
    for (var cx = x0; cx < x1; cx += 3) { g.fillRect(cx, wallTop - 1, 2, 1); }
    // Towers and the keep
    var keepX = Math.round(x0 + (x1 - x0) * 0.38);
    var x = x0 + 3;
    while (x < x1 - 2) {
      var bw = 3 + Math.floor(r() * 6);
      var dist = Math.abs(x - keepX) / (x1 - x0);
      var bh = Math.round((H * 0.06) + r() * H * 0.08 * (1 - dist));
      var top = wallTop - bh;
      g.fillStyle = r() < 0.5 ? "#0f131b" : "#0d1018";
      g.fillRect(x, top, bw, bh);
      if (r() < 0.45) { // spire
        for (var sp = 0; sp < Math.ceil(bw / 2); sp++) g.fillRect(x + sp, top - (Math.ceil(bw / 2) - sp), bw - sp * 2, 1);
      } else {
        for (var cr = x; cr < x + bw; cr += 2) g.fillRect(cr, top - 1, 1, 1);
        if (r() < 0.5) fires.push({ x: x + Math.floor(bw / 2), y: top - 2 });
      }
      for (var wy = top + 2; wy < wallTop - 1; wy += 3) {
        for (var wx = x + 1; wx < x + bw - 1; wx += 2) {
          if (r() < 0.22) windows.push({ x: wx, y: wy, p: r() * 6.28 });
        }
      }
      x += bw + Math.floor(r() * 3);
    }
    // The keep
    var kw = Math.max(8, Math.round(W * 0.04)), kh = Math.round(H * 0.24);
    g.fillStyle = "#0e1219"; g.fillRect(keepX, wallTop - kh, kw, kh);
    for (var kc = keepX; kc < keepX + kw; kc += 2) g.fillRect(kc, wallTop - kh - 1, 1, 1);
    g.fillRect(keepX + Math.floor(kw / 2) - 1, wallTop - kh - 6, 2, 5);
    fires.push({ x: keepX + Math.floor(kw / 2), y: wallTop - kh - 8 });
    for (var ky = wallTop - kh + 3; ky < wallTop - 2; ky += 4) windows.push({ x: keepX + 2, y: ky, p: r() * 6 }), windows.push({ x: keepX + kw - 3, y: ky, p: r() * 6 });
    // Wall-top watch fires
    for (var fx = x0 + 4; fx < x1; fx += 12 + Math.floor(r() * 8)) fires.push({ x: fx, y: wallTop - 3 });

    // Hollow marching across the plains toward the city
    marchers = [];
    var count = narrow ? 0 : Math.round(W / 9);
    for (var m = 0; m < count; m++) {
      marchers.push({ x: r() * (narrow ? W * 0.05 : cliffX - 4), y: plainY - 1 + Math.round(r() * 2), s: 0.02 + r() * 0.04, lim: narrow ? 0 : cliffX - 4 });
    }
    embers = [];
    for (var em = 0; em < Math.round(W / 6); em++) embers.push(newEmber(r, x0, x1, wallTop, true));
    maw.seed = 99;
  }

  var er = rng(7);
  function newEmber(r, x0, x1, top, scatter) {
    return { x: x0 + r() * (x1 - x0), y: scatter ? top - r() * top : top, vx: (r() - 0.5) * 0.15, vy: -(0.12 + r() * 0.25), life: 1 };
  }

  // The Maw tears open over the first two seconds.
  var introStart = performance.now() + 300;
  function drawMaw(g, t) {
    var o = reduce ? 1 : Math.max(0, Math.min(1, (t - introStart) / 1800));
    o = 1 - Math.pow(1 - o, 3);
    if (o <= 0) return;
    var r = rng(maw.seed), half = Math.max(1, maw.h / 2 * o);
    var pulse = 0.85 + Math.sin(t * 0.0015) * 0.15;
    for (var dy = -half; dy <= half; dy++) {
      var k = 1 - Math.pow(dy / half, 2);
      var w = Math.max(0, Math.round((maw.h * 0.11) * k * pulse + r() * 1.5));
      var off = Math.round(Math.sin(dy * 0.35) * 2 + (r() - 0.5) * 2);
      var y = maw.y + dy;
      g.fillStyle = "#9c4519"; g.fillRect(maw.x + off - w - 2, y, w * 2 + 5, 1);
      g.fillStyle = "#ef7b31"; g.fillRect(maw.x + off - w - 1, y, w * 2 + 3, 1);
      if (w > 0) { g.fillStyle = "#f7efe0"; g.fillRect(maw.x + off - w + 1, y, Math.max(1, w * 2 - 1), 1); }
      if (r() < 0.1 && Math.abs(dy) < half * 0.8) { // cracks branching off
        var dir = r() < 0.5 ? -1 : 1, len = 2 + Math.floor(r() * 5);
        g.fillStyle = "#ef7b31";
        for (var c = 0; c < len; c++) g.fillRect(maw.x + off + dir * (w + 2 + c), y + Math.round(c * (r() - 0.3)), 1, 1);
      }
    }
  }

  var last = 0, heroVisible = true, cursorEmbers = [];
  function loop(t) {
    if (heroVisible && t - last >= 80) { last = t; frame(t); }
    requestAnimationFrame(loop);
  }
  function frame(t) {
    if (!base) return;
    ctx.drawImage(base, 0, 0);
    drawMaw(ctx, t);
    // Hollow marchers: pale figures with glowing cracks
    marchers.forEach(function (m) {
      if (!reduce) { m.x += m.s; if (m.lim && m.x > m.lim) m.x = 0; }
      ctx.fillStyle = "#cfc8ba"; ctx.fillRect(Math.round(m.x), m.y - 1, 1, 2);
    });
    // Windows flicker
    windows.forEach(function (w) {
      var on = Math.sin(t * 0.002 + w.p) > -0.6;
      ctx.fillStyle = on ? "#e3a052" : "#5a2c13";
      ctx.fillRect(w.x, w.y, 1, 1);
    });
    // Fires
    fires.forEach(function (f, i) {
      var fl = Math.sin(t * 0.012 + i * 1.7);
      ctx.fillStyle = "#9c4519"; ctx.fillRect(f.x - 1, f.y + 1, 3, 1);
      ctx.fillStyle = "#ef7b31"; ctx.fillRect(f.x, f.y, 1, 2);
      if (fl > 0) { ctx.fillStyle = "#ffd28a"; ctx.fillRect(f.x, f.y - 1, 1, 1); }
    });
    // Embers rising
    embers.forEach(function (e, i) {
      if (!reduce) {
        e.x += e.vx + Math.sin(t * 0.001 + i) * 0.05; e.y += e.vy; e.life -= 0.004;
        if (e.y < 0 || e.life <= 0) {
          var f = fires[Math.floor(er() * fires.length)] || { x: W * 0.7, y: H * 0.6 };
          e.x = f.x; e.y = f.y; e.life = 1; e.vx = (er() - 0.5) * 0.15; e.vy = -(0.12 + er() * 0.25);
        }
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, e.life));
      ctx.fillStyle = e.life > 0.6 ? "#ffb35c" : "#ef7b31";
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
      ctx.globalAlpha = 1;
    });
    // Embers stirred up by the visitor's pointer
    cursorEmbers = cursorEmbers.filter(function (e) {
      e.x += e.vx; e.y += e.vy; e.vy -= 0.01; e.life -= 0.035;
      if (e.life <= 0) return false;
      ctx.globalAlpha = e.life;
      ctx.fillStyle = e.life > 0.5 ? "#ffd28a" : "#ef7b31";
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
      ctx.globalAlpha = 1;
      return true;
    });
  }

  function resize() { buildScene(); frame(performance.now()); }
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { resize(); drawCorridor(); }, 120); });
  resize();
  if (!reduce) requestAnimationFrame(loop);

  /* ---------- Torch meter + corridor ---------- */
  var torch = document.getElementById("torch"), out = document.getElementById("torch-out");
  var levelEl = document.getElementById("light-level"), dangerEl = document.getElementById("torch-danger"), rewardEl = document.getElementById("torch-reward");
  var corr = document.getElementById("corridor-canvas"), cg = corr.getContext("2d");
  var bands = [
    { min: 75, name: "Bright", danger: "Normal enemies. Dread rises slowly.", reward: "Normal loot." },
    { min: 25, name: "Dim", danger: "+25% Dread gain. Enemies hit 10% harder.", reward: "+10% loot." },
    { min: 0, name: "Dark", danger: "Ambushes: the enemy strikes first. +50% Dread gain, and enemies hit 20% harder.", reward: "+25% loot." }
  ];

  function drawCorridor(t) {
    var v = +torch.value;
    var cw = Math.max(60, Math.round(corr.clientWidth / 4)), ch = Math.max(40, Math.round(corr.clientHeight / 4));
    if (corr.width !== cw) corr.width = cw;
    if (corr.height !== ch) corr.height = ch;
    var r = rng(42), light = v / 100;
    var flicker = reduce || !t ? 0 : (Math.sin(t * 0.013) + Math.sin(t * 0.031 + 1)) * 0.035;
    var floor = Math.round(ch * 0.78), ceil = Math.round(ch * 0.14);
    cg.fillStyle = "#050609"; cg.fillRect(0, 0, cw, ch);
    // Stone bricks lit by distance from the torch
    var tx = Math.round(cw * 0.3), ty = Math.round(ch * 0.5);
    var reach = (8 + light * cw * 0.75) * (1 + flicker);
    for (var y = ceil; y < floor; y += 4) {
      var shift = (y / 4) % 2 ? 0 : 4;
      for (var x = -shift; x < cw; x += 8) {
        var d = Math.hypot(x + 4 - tx, y + 2 - ty);
        var b = Math.max(0, 1 - d / reach);
        b = b * b;
        var n = 0.85 + r() * 0.3;
        var R = Math.round((20 + 70 * b) * n), G = Math.round((22 + 48 * b) * n), B = Math.round((30 + 26 * b) * n);
        cg.fillStyle = "rgb(" + R + "," + G + "," + B + ")";
        cg.fillRect(x + 1, y + 1, 7, 3);
      }
    }
    // Floor
    for (var fx = 0; fx < cw; fx++) {
      var fb = Math.max(0, 1 - Math.abs(fx - tx) / reach); fb *= fb;
      cg.fillStyle = "rgb(" + Math.round(14 + 50 * fb) + "," + Math.round(14 + 32 * fb) + "," + Math.round(18 + 16 * fb) + ")";
      cg.fillRect(fx, floor, 1, ch - floor);
    }
    // Party silhouettes (4 ranks) with the torch-bearer at the front
    var px = [tx - 18, tx - 12, tx - 6, tx];
    px.forEach(function (p, i) {
      cg.fillStyle = "#0a0b0f";
      cg.fillRect(p, floor - 9, 3, 7); cg.fillRect(p, floor - 11, 3, 2);
      cg.fillRect(p, floor - 2, 1, 2); cg.fillRect(p + 2, floor - 2, 1, 2);
    });
    cg.fillStyle = "#ef7b31"; cg.fillRect(tx + 3, floor - 13, 1, 3);
    if (light > 0.05 && flicker > -0.04) { cg.fillStyle = "#ffd28a"; cg.fillRect(tx + 3, floor - 14, 1, 1); }
    // Hollow eyes in the dark, more of them as the light fails
    var eyes = Math.round((1 - light) * 7);
    var er2 = rng(5);
    for (var e = 0; e < eyes; e++) {
      var ex = Math.round(cw * 0.55 + er2() * cw * 0.42), ey = Math.round(floor - 8 - er2() * 10);
      if (t && !reduce && Math.sin(t * 0.0021 + e * 2.1) > 0.93) continue; // blink
      cg.fillStyle = "#ebe5d8"; cg.fillRect(ex, ey, 1, 1); cg.fillRect(ex + 2, ey, 1, 1);
    }
  }

  var torchBox = document.querySelector(".torch-box"), lastBand = null;
  function updateTorch() {
    var v = +torch.value;
    out.textContent = v;
    var b = bands.find(function (x) { return v >= x.min; });
    if (lastBand && lastBand !== b.name && !reduce) {
      levelEl.animate([{ opacity: 0, transform: "translateY(8px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 380, easing: "ease-out" });
      if (b.name === "Dark") document.getElementById("corridor").animate([
        { transform: "none" }, { transform: "translate(-3px,1px)" }, { transform: "translate(3px,-1px)" }, { transform: "translate(-1px,1px)" }, { transform: "none" }
      ], { duration: 320 });
    }
    lastBand = b.name;
    torchBox.classList.toggle("is-dark", b.name === "Dark");
    levelEl.textContent = b.name + " (" + (b.name === "Bright" ? "75-100" : b.name === "Dim" ? "25-74" : "0-24") + ")";
    levelEl.style.color = b.name === "Dark" ? "var(--ember)" : "var(--ash)";
    dangerEl.textContent = b.danger;
    rewardEl.textContent = b.reward;
    drawCorridor(performance.now());
  }
  torch.addEventListener("input", function () {
    var before = lastBand;
    updateTorch();
    Sound.crackle();
    if (lastBand === "Dark" && before !== "Dark") Sound.thud();
  });
  updateTorch();

  /* ---------- Home motion ---------- */
  var heroEl = document.querySelector(".hero"), heroInner = document.querySelector(".hero-inner"), hollowEl = document.getElementById("hollow");

  // The hero drifts away as you scroll, and the war drums speed up deeper into the Hollow section.
  var homeQueued = false;
  function onHomeScroll() {
    if (homeQueued) return;
    homeQueued = true;
    requestAnimationFrame(function () {
      homeQueued = false;
      var y = window.scrollY, hr = hollowEl.getBoundingClientRect();
      Sound.setSiege(Math.max(0, Math.min(1, (window.innerHeight - hr.top) / (hr.height + window.innerHeight))));
      if (reduce) return;
      var hh = heroEl.offsetHeight;
      if (y <= hh) {
        heroInner.style.transform = y ? "translateY(" + (y * 0.25).toFixed(1) + "px)" : "";
        heroInner.style.opacity = y ? Math.max(0, 1 - y / (hh * 0.8)).toFixed(3) : "";
        cv.style.transform = y ? "translateY(" + (y * 0.4).toFixed(1) + "px)" : "";
      }
    });
  }
  window.addEventListener("scroll", onHomeScroll, { passive: true });
  onHomeScroll();

  // Pause the hero scene while it is off screen.
  if (hasIO) new IntersectionObserver(function (es) { heroVisible = es[0].isIntersecting; }).observe(heroEl);

  // Opening: the title ignites letter by letter, then the rest of the hero rises in.
  if (!reduce) {
    var h1 = heroEl.querySelector("h1"), word = h1.textContent;
    h1.setAttribute("aria-label", word);
    h1.textContent = "";
    word.split("").forEach(function (ch, i) {
      var s = document.createElement("span");
      s.className = "ch";
      s.setAttribute("aria-hidden", "true");
      s.textContent = ch === " " ? " " : ch;
      h1.appendChild(s);
      s.animate([
        { opacity: 0, transform: "translateY(0.25em) scale(1.2)", color: "#ef7b31", textShadow: "0 0 24px rgba(239,123,49,1)" },
        { opacity: 1, transform: "translateY(0) scale(1)", color: "#ffd28a", textShadow: "0 0 30px rgba(239,123,49,0.8)", offset: 0.45 },
        { opacity: 1, transform: "translateY(0) scale(1)", color: "#ebe5d8", textShadow: "0 0 40px rgba(239,123,49,0.25)" }
      ], { duration: 1300, delay: 300 + i * 75, easing: EASE, fill: "backwards" });
    });
    typeIn(heroEl.querySelector(".eyebrow"), 100);
    riseIn(heroEl.querySelector(".tagline"), 1000);
    riseIn(heroEl.querySelector(".pitch"), 1150);
    heroEl.querySelectorAll(".genres span").forEach(function (el, i) { riseIn(el, 1300 + i * 90); });
    heroEl.querySelectorAll(".actions .btn").forEach(function (el, i) { riseIn(el, 1550 + i * 110); });
  }

  // Countdown: a burning wave runs from Day 1 to the invasion. Click the skull to run it again.
  function wave() {
    if (reduce) return;
    cd.querySelectorAll(".day").forEach(function (d, i) {
      if (d.classList.contains("inv")) {
        d.animate([
          { transform: "none", boxShadow: "0 0 0 0 rgba(239,123,49,0)" },
          { transform: "translate(-2px,0) scale(1.2)", boxShadow: "0 0 26px 6px rgba(239,123,49,.75)" },
          { transform: "translate(2px,0) scale(1.2)", boxShadow: "0 0 26px 6px rgba(239,123,49,.75)" },
          { transform: "none", boxShadow: "0 0 0 0 rgba(239,123,49,0)" }
        ], { duration: 700, delay: i * 35, easing: "ease-out" });
      } else {
        d.animate([
          { transform: "none", borderColor: "#2a3240", boxShadow: "0 0 0 0 rgba(239,123,49,0)" },
          { transform: "translateY(-5px)", borderColor: "#ef7b31", boxShadow: "0 0 12px 1px rgba(239,123,49,.6)", offset: 0.4 },
          { transform: "none", borderColor: "#2a3240", boxShadow: "0 0 0 0 rgba(239,123,49,0)" }
        ], { duration: 520, delay: i * 35, easing: "ease-in-out" });
      }
    });
  }
  if (!reduce && hasIO) {
    var waveIO = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { waveIO.disconnect(); wave(); }
    }, { threshold: 0.6 });
    waveIO.observe(cd);
  }
  cd.addEventListener("click", function (e) { if (e.target.closest(".inv")) { wave(); Sound.horn(); } });

  // Hero: moving the pointer stirs embers; clicking the sky throws a shower of them.
  if (!reduce) {
    var toScene = function (e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    };
    heroEl.addEventListener("pointermove", function (e) {
      if (Math.random() > 0.5) return;
      var p = toScene(e);
      cursorEmbers.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.5, vy: -(0.1 + Math.random() * 0.3), life: 1 });
      if (cursorEmbers.length > 120) cursorEmbers.shift();
    });
    heroEl.addEventListener("pointerdown", function (e) {
      if (e.target.closest("a")) return;
      var p = toScene(e);
      for (var i = 0; i < 24; i++) {
        var a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.9;
        cursorEmbers.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.2, life: 1 });
      }
    });
  }

  // Torchlight flickers while the corridor is on screen.
  if (!reduce && hasIO) {
    var corrVisible = false, lastC = 0;
    new IntersectionObserver(function (es) { corrVisible = es[0].isIntersecting; }).observe(corr);
    (function flick(t) {
      if (corrVisible && t - lastC > 90) { lastC = t; drawCorridor(t); }
      requestAnimationFrame(flick);
    })(0);
  }

  // Cast cards tilt toward the pointer.
  if (!reduce && finePointer) {
    document.querySelectorAll(".hero-card").forEach(function (c) {
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        c.classList.add("tilting");
        c.style.setProperty("--ry", ((px - 0.5) * 10).toFixed(2) + "deg");
        c.style.setProperty("--rx", ((0.5 - py) * 10).toFixed(2) + "deg");
        c.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        c.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      });
      c.addEventListener("pointerleave", function () {
        c.classList.remove("tilting");
        c.style.setProperty("--rx", "0deg");
        c.style.setProperty("--ry", "0deg");
      });
    });
  }

  // A bell for each Decree, a horn for each boss.
  document.querySelectorAll("#city tbody tr").forEach(function (tr) { tr.addEventListener("pointerenter", Sound.bell); });
  document.querySelectorAll(".boss-card").forEach(function (c) { c.addEventListener("pointerenter", Sound.horn); });
})();
