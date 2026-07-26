(function () {
  const params = new URLSearchParams(location.search);
  const domain = params.get('domain') || 'this website';
  const start = params.get('start') || '--:--';
  const end = params.get('end') || '--:--';

  document.getElementById('blocked-domain').textContent = domain;

  function formatTime(time) {
    if (!/^\d{2}:\d{2}$/.test(time)) return time;
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${suffix}`;
  }

  document.getElementById('blocked-message').textContent =
    `You can only access this site outside ${formatTime(start)} – ${formatTime(end)}.`;
})();
