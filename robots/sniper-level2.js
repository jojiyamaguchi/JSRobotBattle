// progrobots: スナイパー Level 2
// Level 1の動きに加えて、衝突直前の敵弾をシールドで防ぎます。

self.onmessage = ({ data }) => {
  const target = data.players.find(player => player.color !== data.color);
  if (!target) return;

  // 20px以内まで敵の弾丸が迫り、エネルギーが10以上ならシールドを展開する
  const nearbyBullet = data.bullets.find(
    bullet => bullet.color !== data.color && bullet.distance < 20
  );

  if (nearbyBullet && data.energy >= 10) {
    postMessage({ action: { type: "shield" } });
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
