// servidor simulado do Evolution Idle World (só para testar os plugins)
const http = require('http'), { WebSocketServer } = require('ws');
const page = `<!doctype html><html><head><meta charset="utf-8"><title>Evolution Idle World (demo)</title>
<style>body{margin:0;height:100vh;background:repeating-linear-gradient(45deg,#e9d8a6 0 24px,#e3cf98 24px 48px);font-family:sans-serif}
.hud{position:fixed;left:10px;top:10px;background:#122;color:#fff;padding:10px;border-radius:8px}</style></head>
<body><div class="hud">TAMER (demo)</div><script>
const n = new URLSearchParams(location.search).get('n') || 'Sonnin';
const ws = new WebSocket('ws://' + location.host + '/socket.io/?n=' + encodeURIComponent(n));
ws.onmessage = (e) => { if (e.data === '2') ws.send('3'); };
</script></body></html>`;
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); });
const wss = new WebSocketServer({ server: srv });
wss.on('connection', (ws, req) => {
  const name = new URL(req.url, 'http://x').searchParams.get('n') || 'Sonnin';
  const send = (ev, d) => ws.readyState === 1 && ws.send('42' + JSON.stringify([ev, d]));
  ws.send('0{"sid":"x","pingInterval":5000}'); ws.send('40');
  let t = 0, coins = 1051258, txp = 30115, pxp = 2100, hp = 150, party = [[18444, 33594], [3533, 36990], [21481, 21491], [2100, 2398]];
  const now = Date.now();
  send('boss_timers', [{ name: 'Andromon', zone: 'Planície Sombria (Hard)', next_at: now + 7 * 60e3 }, { name: 'Etemon', zone: 'Deserto', respawn_in: 3600 }]);
  send('egg_incubated', { egg: { name: 'Ovo Raro' }, ready_at: now + 3 * 60e3 });
  const iv = setInterval(() => {
    t++;
    if (t % 10 === 0) ws.send('2');
    const kill = t % 2 === 0;
    if (kill) { coins += 30; txp += 120; pxp += 110; party = party.map(([a, b], i) => [Math.min(b - 1, a + (i === 3 ? 110 : 40)), b]); }
    hp = Math.max(20, hp - 9);
    send('attack_result', { uid: t, attacker: name, result: { hit: true, damage: 25, killed: kill, type_mult: 1.5 },
      rewards: kill ? { xp: 120, coins: 30, drops: [], tamer_levels: 0 } : undefined,
      player_update: { coins, tamer_level: 122, tamer_points_free: 1, tamer_xp: txp, tamer_xp_to_next: 56943, partner_hp: hp, partner_max_hp: 180, partner_level: 22, partner_xp: pxp, partner_xp_to_next: 2608, active_index: 3, evolved_to: null, party_xp: party } });
    if (t % 6 === 0) { hp = Math.min(180, hp + 30); send('item_used', { code: 'item.healed', args: ['Koromon', 30], item_id: 'meat', target_index: 3, new_hp: hp, max_hp: 180 }); }
    if (t % 25 === 0) { coins -= 1000; send('shop_bought', { shop_id: 'buy_meat', qty: 20, coins }); }
    if (t === 12) send('chat_message', { from: '[Sistema]', message: 'Andromon apareceu', code: 'boss.spawned', args: ['Andromon', { zone: 'shadow_plains_hard', pt: 'Planície Sombria (Hard)' }] });
    if (t === 16) send('wild_respawned', { uid: 99, species: 'Gabumon', level: 18, prismatic: true, special: false, is_boss: false });
    if (t === 20) send('pm_message', { from: 'Tai', message: 'bora caçar o Andromon?' });
  }, 500);
  ws.on('close', () => clearInterval(iv));
});
srv.listen(8766, () => console.log('mock eiw em http://127.0.0.1:8766/play'));
