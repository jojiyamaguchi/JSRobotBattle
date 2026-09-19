// progrobots: デミゴッド
// 味方への誤射を避け、攻撃直前のシールドと迂回移動を組み合わせる最強機体です。

const BULLET_SHIELD_DISTANCE = 17;
const PUNCH_SHIELD_DISTANCE = 22;
const FIRE_DISTANCE = 90;
const ROUTE_WIDTH = 24;
const SHOT_WIDTH = 14;

let detourDirection = 60;
let detourFrames = 0;

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// startからendへ向かう線分に、pointがどれくらい近いかを調べる
function pointOnRoute(point, start, end, width, endMargin = 0) {
  const routeX = end.x - start.x;
  const routeY = end.y - start.y;
  const routeLength = Math.hypot(routeX, routeY);
  if (routeLength === 0) return false;

  const pointX = point.x - start.x;
  const pointY = point.y - start.y;
  const projection =
    (pointX * routeX + pointY * routeY) / routeLength;

  if (projection <= 10 || projection >= routeLength - endMargin) {
    return false;
  }

  const perpendicular =
    Math.abs(pointX * routeY - pointY * routeX) / routeLength;
  return perpendicular < width;
}

function chooseDetour(data, blocker) {
  // 味方がいる側とは反対の斜め前方へ回り込む
  let direction = blocker.angle >= 0 ? 60 : -60;

  // フィールド端へ向かいそうな場合は反対側を選ぶ
  if (data.x < 35 && direction < 0) direction = 60;
  if (data.x > 365 && direction > 0) direction = -60;
  if (data.y < 35 && Math.abs(data.dir - 90) < 50) direction *= -1;
  if (data.y > 565 && Math.abs(data.dir - 270) < 50) direction *= -1;

  detourDirection = direction;
  detourFrames = 24;
}

self.onmessage = ({data}) => {
  const enemies = data.players.filter(player => player.color !== data.color);
  const allies = data.players.filter(player => player.color === data.color);
  const target = enemies[0];
  if (!target) return;

  // パンチが命中する直前だけシールドする
  const incomingPunch = data.punches.find(
    punch =>
      punch.color !== data.color &&
      punch.distance <= PUNCH_SHIELD_DISTANCE
  );
  if (incomingPunch && data.energy >= 4) {
    postMessage({action: {type: "shield"}});
    return;
  }

  // 弾丸が機体の目前まで来た時だけシールドする
  const incomingBullet = data.bullets.find(
    bullet =>
      bullet.color !== data.color &&
      bullet.distance <= BULLET_SHIELD_DISTANCE
  );
  if (incomingBullet && data.energy >= 4) {
    postMessage({action: {type: "shield"}});
    return;
  }

  const routeBlocker = allies.find(
    ally =>
      ally.distance < target.distance &&
      pointOnRoute(ally, data, target, ROUTE_WIDTH, 18)
  );

  // 味方が進路を塞いでいたら、斜め前方へ迂回する
  if (routeBlocker && target.distance > 6) {
    if (detourFrames <= 0) chooseDetour(data, routeBlocker);
    detourFrames--;

    if (data.energy >= 2) {
      postMessage({
        action: {type: "move", dir: detourDirection}
      });
    } else {
      postMessage({action: {type: "charge"}});
    }
    return;
  }
  detourFrames = 0;

  // 接近戦では相手の正面を向いてパンチする
  if (target.distance <= 3) {
    if (Math.abs(target.angle) > 5) {
      if (data.energy >= 2) {
        postMessage({action: {type: "turn", dir: target.angle}});
      } else {
        postMessage({action: {type: "charge"}});
      }
    } else if (data.energy >= 6) {
      postMessage({action: {type: "punch"}});
    } else {
      postMessage({action: {type: "charge"}});
    }
    return;
  }

  if (Math.abs(target.angle) > 3) {
    if (data.energy >= 2) {
      postMessage({action: {type: "turn", dir: target.angle}});
    } else {
      postMessage({action: {type: "charge"}});
    }
    return;
  }

  // 射線上に味方がいる場合は発射しない
  const friendlyInShotLine = allies.some(ally =>
    pointOnRoute(ally, data, target, SHOT_WIDTH, 10)
  );

  // 遠距離では安全な射線が取れた時だけ射撃する
  if (
    target.distance >= FIRE_DISTANCE &&
    !friendlyInShotLine &&
    data.energy >= 40
  ) {
    postMessage({action: {type: "fire"}});
    return;
  }

  // 射撃できない時は、味方を避けながら接近戦へ持ち込む
  if (data.energy >= 2) {
    postMessage({action: {type: "move", dir: 0}});
  } else {
    postMessage({action: {type: "charge"}});
  }
};
