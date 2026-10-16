/* ---------------------------------------------------------------------------
   Zhen Wang — site behaviour.

   Everything here is progressive enhancement: the pages are complete and
   readable with this file blocked, and nothing is hidden by CSS until JS is
   running. Motion is skipped entirely when the visitor asks for less of it.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hasIO = 'IntersectionObserver' in window;

    /* --- reveal on scroll ------------------------------------------------
       The .reveal class is added here, not in the HTML, so a failed script can
       never leave content invisible.

       An IntersectionObserver alone is not enough: a fast scroll, an anchor
       jump, or a restored scroll position can carry an element past the
       viewport without the observer ever reporting it, and the section then
       stays at opacity 0 forever — which is exactly the failure this page hit
       in the wild. So the observer is backed by a scroll pass that reveals
       anything at or above the fold, and by a timer that gives up on the whole
       effect rather than ever withholding content. */
    function revealOnScroll() {
        if (reduced || !hasIO) return;

        var targets = document.querySelectorAll('.main > section, .page > article > section, .card');
        if (!targets.length) return;

        Array.prototype.forEach.call(targets, function (el, i) {
            // the first screenful is already visible — revealing it just makes the page feel slow
            if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;
            el.classList.add('reveal');
            el.style.transitionDelay = (Math.min(i, 4) * 40) + 'ms';
        });

        var pending = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
        if (!pending.length) return;

        function show(el) {
            el.classList.add('is-in');
            var at = pending.indexOf(el);
            if (at > -1) pending.splice(at, 1);
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                show(entry.target);
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

        pending.forEach(function (el) { io.observe(el); });

        // anything the observer missed: if its top has reached the fold, show it
        var ticking = false;
        function sweep() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                ticking = false;
                Array.prototype.slice.call(pending).forEach(function (el) {
                    if (el.getBoundingClientRect().top >= window.innerHeight) return;
                    show(el);
                    io.unobserve(el);
                });
                if (!pending.length) window.removeEventListener('scroll', sweep);
            });
        }
        window.addEventListener('scroll', sweep, { passive: true });
        window.addEventListener('resize', sweep, { passive: true });
        sweep();

        // last resort: never let the effect be the reason something cannot be read
        window.setTimeout(function () {
            Array.prototype.slice.call(pending).forEach(show);
            io.disconnect();
        }, 4000);
    }

    /* --- which section am I reading --------------------------------------
       Highlights the overview sidebar nav. Uses the observer rather than a
       scroll handler so there is no work per scroll event. */
    function trackSections() {
        var links = document.querySelectorAll('.sidebar-sections a');
        if (!links.length || !hasIO) return;

        var byId = {};
        var sections = [];
        Array.prototype.forEach.call(links, function (link) {
            var id = link.getAttribute('href').slice(1);
            var section = document.getElementById(id);
            if (!section) return;
            byId[id] = link;
            sections.push(section);
        });
        if (!sections.length) return;

        var visible = {};
        function paint() {
            var current = null;
            sections.forEach(function (section) {
                if (visible[section.id]) current = current || section.id;
            });
            Array.prototype.forEach.call(links, function (link) { link.classList.remove('is-current'); });
            if (current && byId[current]) byId[current].classList.add('is-current');
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
            paint();
        }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });

        sections.forEach(function (section) { io.observe(section); });
    }

    revealOnScroll();
    trackSections();
})();

/* ---------------------------------------------------------------------------
   Prerequisite-graph widget (overview page).

   The SVG is generated from the real parsed graph in the course-planning agent
   — 27 courses, 32 edges — and is meaningful as a static picture. This only
   adds the highlighting: hovering or focusing a course lights up its full
   prerequisite closure, which is exactly the set the planner's validator
   computes before it lets the model choose anything.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var svg = document.getElementById('dag');
    if (!svg) return;

    var nodes = Array.prototype.slice.call(svg.querySelectorAll('.dag-node'));
    var edges = Array.prototype.slice.call(svg.querySelectorAll('.dag-edge'));
    var readout = document.querySelector('.dag-readout');
    var fallback = readout ? readout.getAttribute('data-default') : '';
    var pinned = null;

    var incoming = {};           // course -> [prerequisite, ...]
    edges.forEach(function (edge) {
        var to = edge.getAttribute('data-to');
        (incoming[to] = incoming[to] || []).push(edge.getAttribute('data-from'));
    });

    function closure(id) {
        var seen = {}, queue = [id];
        while (queue.length) {
            var cur = queue.shift();
            (incoming[cur] || []).forEach(function (parent) {
                if (seen[parent]) return;
                seen[parent] = true;
                queue.push(parent);
            });
        }
        return seen;
    }

    function clear() {
        svg.classList.remove('is-active');
        nodes.forEach(function (n) { n.classList.remove('is-anc', 'is-target'); });
        edges.forEach(function (e) { e.classList.remove('is-on'); });
        if (readout) readout.textContent = fallback;
    }

    function show(id) {
        var need = closure(id);
        svg.classList.add('is-active');

        nodes.forEach(function (node) {
            var nid = node.getAttribute('data-id');
            node.classList.toggle('is-target', nid === id);
            node.classList.toggle('is-anc', !!need[nid]);
        });
        edges.forEach(function (edge) {
            var to = edge.getAttribute('data-to');
            edge.classList.toggle('is-on', to === id || !!need[to]);
        });

        if (!readout) return;
        var list = Object.keys(need).sort();
        readout.innerHTML = list.length
            ? '<strong>' + id + '</strong> needs ' + list.length + ' course' +
              (list.length === 1 ? '' : 's') + ' first: ' + list.join(', ') + '.'
            : '<strong>' + id + '</strong> has no prerequisites in this map — a place a plan can start.';
    }

    nodes.forEach(function (node) {
        var id = node.getAttribute('data-id');
        node.addEventListener('mouseenter', function () { if (!pinned) show(id); });
        node.addEventListener('focus', function () { if (!pinned) show(id); });
        node.addEventListener('blur', function () { if (!pinned) clear(); });
        node.addEventListener('click', function () {
            pinned = pinned === id ? null : id;
            pinned ? show(id) : clear();
        });
        node.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            pinned = pinned === id ? null : id;
            pinned ? show(id) : clear();
        });
    });

    svg.addEventListener('mouseleave', function () { if (!pinned) clear(); });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && pinned) { pinned = null; clear(); }
    });
})();

/* ---------------------------------------------------------------------------
   Back to top — only below 900px, where the sticky sidebar is gone and a long
   detail page leaves no other way back. Injected from JS so it never appears
   as dead markup for the desktop layout.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    if (!window.matchMedia || !window.matchMedia('(max-width: 900px)').matches) return;

    var button = document.createElement('button');
    button.className = 'to-top';
    button.type = 'button';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = '<span aria-hidden="true">&#8593;</span>';
    document.body.appendChild(button);

    button.addEventListener('click', function () {
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
            button.classList.toggle('is-shown', window.pageYOffset > 700);
            ticking = false;
        });
    }, { passive: true });
})();

/* ---------------------------------------------------------------------------
   Plan Validator (course-planner page). No-ops on every other page.

   The two plans and every verdict line below were produced by running the
   planner's own validator.py against the corrected course graph — they are
   recorded output, not a re-implementation, so nothing here can drift from
   what the app actually says. The page only replays them and lets you look up
   a course's prerequisite groups.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var root = document.getElementById('pv');
    if (!root) return;

    var D = {"units":{"DSC 10":4,"DSC 20":4,"DSC 30":4,"DSC 40A":4,"DSC 40B":4,"DSC 80":4,"DSC 100":4,"DSC 102":4,"DSC 106":4,"DSC 140A":4,"DSC 140B":4,"DSC 148":4,"DSC 180A":4,"DSC 180B":4,"MATH 18":4,"MATH 20A":4,"MATH 20B":4,"MATH 20C":4,"MATH 183":4,"MATH 180A":4,"MATH 189":4,"COGS 9":4},"done":["DSC 10","MATH 18","MATH 20A","MATH 20B"],"groups":{"DSC 20":[["DSC 10"]],"DSC 30":[["DSC 20"]],"DSC 40A":[["DSC 10"],["MATH 20C"],["MATH 18"]],"DSC 40B":[["DSC 20"],["DSC 40A"]],"DSC 80":[["DSC 30"],["DSC 40A"]],"DSC 100":[["DSC 40B"],["DSC 80"]],"DSC 106":[["DSC 80"]],"DSC 140A":[["DSC 80"],["ECE 109","MATH 180A","MATH 183"]],"MATH 20C":[["MATH 20B"]],"MATH 183":[["MATH 20B"]],"MATH 180A":[["MATH 20C"]],"COGS 9":[]},"perq":{"plan":[["DSC 20","MATH 183","MATH 20C"],["DSC 30","DSC 40A","MATH 180A"],["COGS 9","DSC 40B","DSC 80"],["DSC 100","DSC 106","DSC 140A"]],"log":[{"term":1,"eligible":["DSC 20","MATH 20C","MATH 183","COGS 9"],"placed":["DSC 20","MATH 183","MATH 20C"]},{"term":2,"eligible":["DSC 40A","DSC 30","MATH 180A","COGS 9"],"placed":["DSC 30","DSC 40A","MATH 180A"]},{"term":3,"eligible":["DSC 80","DSC 40B","COGS 9"],"placed":["COGS 9","DSC 40B","DSC 80"]},{"term":4,"eligible":["DSC 100","DSC 106","DSC 140A"],"placed":["DSC 100","DSC 106","DSC 140A"]}],"violations":[]},"oneshot":{"plan":[["DSC 20","DSC 40A","DSC 80"],["DSC 30","MATH 20C","DSC 140A"],["MATH 183","DSC 40B","COGS 9"],["DSC 100","DSC 106","MATH 180A"]],"violations":[{"code":"PREREQ_MISSING","course":"DSC 40A","msg":"DSC 40A in Q1 Fall requires MATH 20C, which the plan schedules in a later term."},{"code":"PREREQ_MISSING","course":"DSC 80","msg":"DSC 80 in Q1 Fall requires DSC 30, which the plan schedules in a later term."},{"code":"PREREQ_MISSING","course":"DSC 80","msg":"DSC 80 in Q1 Fall requires DSC 40A, which is scheduled in the same term, not before it."},{"code":"PREREQ_MISSING","course":"DSC 140A","msg":"DSC 140A in Q2 Winter requires ECE 109 or MATH 180A or MATH 183, which the plan schedules in a later term."}]}};

    var terms = [].slice.call(root.querySelectorAll('[data-pv-term]'));
    var slots = terms.map(function (t) { return t.querySelector('[data-pv-slot]'); });
    var unitEls = terms.map(function (t) { return t.querySelector('[data-pv-u]'); });
    var verdict = root.querySelector('[data-pv-verdict]');
    var log = root.querySelector('[data-pv-log]');
    var mode = 'perq';

    function where(id) {
        if (D.done.indexOf(id) > -1) return 'completed';
        var plan = D[mode].plan;
        for (var i = 0; i < plan.length; i++) if (plan[i].indexOf(id) > -1) return 'Q' + (i + 1);
        return null;
    }

    function unitsOf(list) {
        return list.reduce(function (sum, id) { return sum + (D.units[id] || 0); }, 0);
    }

    function render() {
        var state = D[mode];
        var flagged = {};
        state.violations.forEach(function (v) { if (v.course) flagged[v.course] = true; });

        state.plan.forEach(function (row, i) {
            slots[i].innerHTML = row.map(function (id) {
                return '<button type="button" class="pv-c' + (flagged[id] ? ' flag' : '') +
                    '" data-id="' + id + '">' + id + '<i>' + D.units[id] + '</i></button>';
            }).join('');
            unitEls[i].textContent = unitsOf(row) + 'u';
            var bad = state.violations.some(function (v) { return v.msg.indexOf('Q' + (i + 1)) === 0 || (v.course && row.indexOf(v.course) > -1); });
            terms[i].className = 'pv-term ' + (bad ? 'bad' : 'ok');
        });

        var errors = state.violations.length;
        verdict.className = 'pv-verdict ' + (errors ? 'pv-fail' : 'pv-pass');
        verdict.textContent = errors
            ? 'Rejected · ' + errors + ' error' + (errors === 1 ? '' : 's')
            : 'Accepted · 12 of 12 courses legal · 0 errors';

        var lines;
        if (mode === 'oneshot') {
            lines = ['<span class="i">one-shot</span> the whole plan proposed in one pass, then checked edge by edge:']
                .concat(state.violations.map(function (v) {
                    return '<span class="e">\u2715</span> ' + v.msg;
                }))
                .concat(['<span class="e">\u2715</span> One error rejects the whole plan.']);
        } else {
            lines = ['<span class="i">per-quarter</span> each term drawn from the eligible set, recomputed first:']
                .concat(state.log.map(function (entry) {
                    return '<span class="i">Q' + entry.term + '</span> eligible = {' + entry.eligible.join(', ') +
                        '} \u2192 placed ' + entry.placed.join(', ') + ' · <b>' + unitsOf(entry.placed) + 'u</b>';
                }))
                .concat(['<span class="g">\u2713</span> Accepted on the first pass — no repair round needed.']);
        }
        log.innerHTML = '<li>' + lines.join('</li><li>') + '</li>';
    }

    function explain(id) {
        var groups = D.groups[id];
        var place = where(id);
        var head = '<b>' + id + '</b>' + (place === 'completed' ? ' — already completed.' : place ? ' — scheduled in ' + place + '.' : '.');
        if (!groups || !groups.length) {
            log.innerHTML = '<li>' + head + ' No prerequisites in the catalog text.</li>';
            return;
        }
        var rows = groups.map(function (group) {
            var options = group.map(function (option) {
                var at = where(option);
                return option + (at ? ' <span class="g">(' + at + ')</span>' : ' <span class="muted">(not in this plan)</span>');
            });
            return 'needs ' + options.join(' <i>or</i> ');
        });
        log.innerHTML = '<li>' + head + '</li><li>' + rows.join('</li><li>') + '</li>';
    }

    root.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('button');
        if (!button || !root.contains(button)) return;
        var pv = button.getAttribute('data-pv');
        if (pv) {
            mode = pv;
            root.querySelectorAll('[data-pv]').forEach(function (b) {
                b.className = 'pv-btn' + (b.getAttribute('data-pv') === mode ? '' : ' pv-btn-ghost');
            });
            render();
            return;
        }
        var id = button.getAttribute('data-id');
        if (id) explain(id);
    });

    render();
})();
