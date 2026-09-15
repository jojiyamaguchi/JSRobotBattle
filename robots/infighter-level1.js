// progrobots: インファイター Level 1
// 最も近い敵へ接近し、間合いに入ったらパンチします。

self.onmessage = ({ data }) => {
  const target = data.players.find(player => player.color !== data.color);
  if (!target) return;

  if (Math.abs(target.angle) > 5) {
    postMessage({ action: { type: "turn", dir: target.angle } });
    return;
  }

  if (target.distance <= 2) {
    const action = data.energy >= 6 ? "punch" : "charge";
    postMessage({ action: { type: action } });
    return;
  }

  const action = data.energy >= 2 ? "move" : "charge";
  postMessage({ action: { type: action, dir: 0 } });
};
