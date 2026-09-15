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
    // エネルギーが50以上あるときはパンチする
    if (data.energy >= 50) {
      postMessage({ action: { type: "punch" } });
    } else {
      // エネルギーが50未満のときはチャージする
      postMessage({ action: { type: "charge" } });
    }
    return;
  }

  postMessage({ action: { type: "move", dir: 0 } });
};
