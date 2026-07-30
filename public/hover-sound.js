(function () {
  var ctx = null;
  var lastPlayed = 0;
  var COOLDOWN = 60; // ms between sounds to avoid rapid-fire spam

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function playTick() {
    var now = Date.now();
    if (now - lastPlayed < COOLDOWN) return;
    lastPlayed = now;

    try {
      var ac = getCtx();
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(340, ac.currentTime + 0.05);

      gain.gain.setValueAtTime(0.07, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);

      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.04);
    } catch (e) {}
  }

  var SELECTORS = 'button, .card-tile, .shop-card, .back-btn, .nav-btn, [role="button"], a[href]';

  function attach(el) {
    if (el._hoverSoundAttached) return;
    el._hoverSoundAttached = true;
    el.addEventListener('mouseenter', playTick);
  }

  function attachAll() {
    document.querySelectorAll(SELECTORS).forEach(attach);
  }

  document.addEventListener('DOMContentLoaded', attachAll);

  // Catch dynamically added elements (modals, card renders, etc.)
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(SELECTORS)) attach(node);
        node.querySelectorAll && node.querySelectorAll(SELECTORS).forEach(attach);
      });
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
