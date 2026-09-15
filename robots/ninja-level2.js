// progrobots: ニンジャ Level 2
// ニンジャ Level 1を基本に、仲間が5体になるまでデコイを作ってから攻撃します。

let decoyPending = false;
let previousTeamCount = 0;

self.onmessage = ({ data }) => {
  const target = data.players.find(player => player.color !== data.color);
  if (!target) return;

  // 自分自身と、同じ色の機体を合わせて自チームの機体数を数える
  const teamCount =
    1 + data.players.filter(player => player.color === data.color).length;

  // 作成したデコイが機体になったら、次のデコイを作れるようにする
  if (teamCount > previousTeamCount) {
    decoyPending = false;
  }
  previousTeamCount = teamCount;

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

  // 20px以内まで敵の弾丸が迫り、エネルギーが10以上ならシールドを展開する
  const nearbyBullet = data.bullets.find(
    bullet => bullet.color !== data.color && bullet.distance < 20
  );

  if (nearbyBullet && data.energy >= 10) {
    postMessage({ action: { type: "shield" } });
    return;
  }

  // 自チームが5体未満なら、正面斜めの位置にデコイを作る
  if (teamCount < 5) {
    if (!decoyPending && data.energy >= 60) {
      const decoyDirection = Math.random() < 0.5 ? -60 : 60;
      postMessage({
        action: {
          type: "decoy",
          dir: decoyDirection,
          color: data.color
        }
      });
      decoyPending = true;
    } else {
      postMessage({ action: { type: "charge" } });
    }
    return;
  }

  if (Math.abs(target.angle) > 2) {
    postMessage({ action: { type: "turn", dir: target.angle } });
    return;
  }

  // デコイを作り終え、エネルギーが100以上あるときは射撃する
  if (data.energy >= 100) {
    postMessage({ action: { type: "fire" } });
  } else {
    postMessage({ action: { type: "charge" } });
  }
};
