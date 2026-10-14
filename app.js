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
       The .reveal class is added here, not in the HTML, so a failed script
       can never leave content invisible. */
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

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

        Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
            io.observe(el);
        });
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
