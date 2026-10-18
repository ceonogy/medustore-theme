/**
 * Scroll reveal — the storefront equivalent of the reference template's
 * Framer "Appear" effect (51 nodes start at opacity 0.001 + translateY(30px)
 * and settle as they enter the viewport).
 *
 * Markup opts in with `class="reveal"` (+ optional `reveal-left` /
 * `reveal-nav`) and `data-reveal`. Delays are set inline as
 * `style="--reveal-delay: 120ms"` for staggered groups.
 *
 * Astro's ClientRouter swaps the document on navigation, so the observer is
 * (re)installed on every `astro:page-load`.
 */

const SELECTOR = "[data-reveal]";

function reveal(root: ParentNode = document) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    (node) => !node.dataset.revealSeen,
  );

  if (!nodes.length) return;

  // Reduced motion is answered in CSS (global.css): the scroll reveal
  // keeps a pure opacity fade and drops the translate, so a visitor
  // who asked for less motion still watches content arrive.

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );

  for (const node of nodes) {
    node.dataset.revealSeen = "1";
    observer.observe(node);
  }
}

document.addEventListener("astro:page-load", () => reveal());

// Belt and braces: if the event already fired before this module executed,
// reveal immediately rather than leaving the page at opacity 0.001.
if (document.readyState !== "loading") {
  reveal();
}
