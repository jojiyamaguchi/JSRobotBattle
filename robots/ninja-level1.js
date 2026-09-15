// progrobots: ニンジャ Level 1
// 遠距離では射撃し、敵弾を斜め前方へのサイドステップでかわします。

self.onmessage = ({ data }) => {
  const target = data.players.find(player => player.color !== data.color);
  if (!target) return;

  // 相手がパンチの間合いに入ったら、接近戦を優先する
  if (target.distance <= 2) {
    if (Math.abs(target.angle) > 5) {
      postMessage({ action: { type: "turn", dir: target.angle } });
    } else if (data.energy >= 6) {
      postMessage({ action: { type: "punch" } });
    } else {
      postMessage({ action: { type: "charge" } });
    }
    return;
  }

  // 60px以内に敵の弾丸が来たら、斜め前方へサイドステップする
  const nearbyBullet = data.bullets.find(
    bullet => bullet.color !== data.color && bullet.distance < 60
  );

  if (nearbyBullet) {
    if (data.energy >= 2) {
      // 弾丸がある側とは反対方向へ、斜め前方に移動する
      const sidestepDirection = nearbyBullet.angle >= 0 ? 60 : -60;
      postMessage({ action: { type: "move", dir: sidestepDirection } });
    } else {
      postMessage({ action: { type: "charge" } });
    }
    return;
  }

  if (Math.abs(target.angle) > 2) {
    postMessage({ action: { type: "turn", dir: target.angle } });
    return;
  }

  // エネルギーが100以上あるときは射撃する
  if (data.energy >= 100) {
    postMessage({ action: { type: "fire" } });
  } else {
    // エネルギーが100未満のときはチャージする
    postMessage({ action: { type: "charge" } });
  }
};
