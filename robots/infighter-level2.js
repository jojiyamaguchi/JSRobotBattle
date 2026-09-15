// progrobots: インファイター Level 2
// Level 1の動きに加えて、近くの敵弾を回避し、迫った敵弾をシールドで防ぎます。

self.onmessage = ({ data }) => {
  const target = data.players.find(player => player.color !== data.color);
  if (!target) return;

  // 60px以内にある、最も近い敵の弾丸を探す
  const nearbyBullet = data.bullets.find(
    bullet => bullet.color !== data.color && bullet.distance < 60
  );

  if (nearbyBullet && data.energy >= 4) {
    // 弾丸が25px以内まで迫ったらシールドを優先する
    if (nearbyBullet.distance < 25) {
      postMessage({ action: { type: "shield" } });
    } else {
      // 弾丸がある側とは反対方向へ斜め移動する
      const evadeDirection = nearbyBullet.angle >= 0 ? 45 : -45;
      postMessage({ action: { type: "move", dir: evadeDirection } });
    }
    return;
  }

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

  // エネルギーが10以上あるときは前進する
  if (data.energy >= 10) {
    postMessage({ action: { type: "move", dir: 0 } });
  } else {
    // エネルギーが10未満のときはチャージする
    postMessage({ action: { type: "charge" } });
  }
};
