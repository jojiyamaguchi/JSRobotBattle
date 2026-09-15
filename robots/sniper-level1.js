// progrobots: スナイパー Level 1
// その場から最も近い敵を狙い、射撃します。移動はしません。

self.onmessage = ({ data }) => {
  const target = data.players.find(player => player.color !== data.color);
  if (!target) return;

  if (Math.abs(target.angle) > 2) {
    postMessage({ action: { type: "turn", dir: target.angle } });
    return;
  }

  const action = data.energy >= 40 ? "fire" : "charge";
  postMessage({ action: { type: action } });
};
