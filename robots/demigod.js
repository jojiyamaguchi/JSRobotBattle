// progrobots: デミゴッド
// 50エネルギーを「回避用温存エネルギー」として残し、
// 味方への誤射回避・緊急回避・直前シールドを組み合わせる最強機体です。

const EVASION_ENERGY_RESERVE = 50;
const MOVE_COST = 2;
const TURN_COST = 2;
const FIRE_COST = 40;
const PUNCH_COST = 6;

const BULLET_EVASION_DISTANCE = 55;
const BULLET_SHIELD_DISTANCE = 17;
const PUNCH_SHIELD_DISTANCE = 22;
const EVASION_LOOK_AHEAD = 24;
const ROBOT_RADIUS = 10;
const FIELD_WIDTH = 400;
const FIELD_HEIGHT = 600;

const MIN_FIRE_DISTANCE = 35;
const ADVANCE_STEPS_BEFORE_SHOT = 30;
const ROUTE_WIDTH = 24;
const SHOT_WIDTH = 14;

let detourDirection = 60;
let detourFrames = 0;
let advanceSteps = 0;

function canUseRegularAction(data, cost) {
  return data.energy >= EVASION_ENERGY_RESERVE + cost;
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

// 弾丸の速度から、この機体へ向かっている弾丸だけを選ぶ
function isIncomingBullet(bullet, data) {
  if (bullet.color === data.color) return false;
  if (!Number.isFinite(bullet.vx) || !Number.isFinite(bullet.vy)) {
    return bullet.distance <= BULLET_SHIELD_DISTANCE;
  }

  const toRobotX = data.x - bullet.x;
  const toRobotY = data.y - bullet.y;
  const speedSquared = bullet.vx ** 2 + bullet.vy ** 2;
  if (speedSquared === 0) return false;

  const framesToClosestPoint =
    (toRobotX * bullet.vx + toRobotY * bullet.vy) / speedSquared;
  if (framesToClosestPoint < 0 || framesToClosestPoint > 12) return false;

  const closestX = bullet.x + bullet.vx * framesToClosestPoint;
  const closestY = bullet.y + bullet.vy * framesToClosestPoint;
  const closestDistance = Math.hypot(
    closestX - data.x,
    closestY - data.y
  );

  return (
    bullet.distance <= BULLET_EVASION_DISTANCE &&
    closestDistance < ROBOT_RADIUS + 5
  );
}

function emergencyEvadeDirection(bullet) {
  // 弾丸が入ってくる側とは反対の、斜め前方へ回避する
  return bullet.angle >= 0 ? 45 : -45;
}

function emergencyEvadePathIsClear(data, allies, direction) {
  const angle = (data.dir - direction) * Math.PI / 180;

  // 斜め前方24pxまでを確認し、端や味方があれば回避不可とする
  for (let distance = 6; distance <= EVASION_LOOK_AHEAD; distance += 6) {
    const x = data.x + Math.cos(angle) * distance;
    const y = data.y + Math.sin(angle) * distance;

    if (
      x < ROBOT_RADIUS ||
      x > FIELD_WIDTH - ROBOT_RADIUS ||
      y < ROBOT_RADIUS ||
      y > FIELD_HEIGHT - ROBOT_RADIUS
    ) {
      return false;
    }

    if (
      allies.some(ally =>
        Math.hypot(ally.x - x, ally.y - y) < ROBOT_RADIUS * 2 + 4
      )
    ) {
      return false;
    }
  }
  return true;
}

self.onmessage = ({data}) => {
  const enemies = data.players.filter(player => player.color !== data.color);
  const allies = data.players.filter(player => player.color === data.color);
  const target = enemies[0];
  if (!target) return;

  // パンチが命中する直前は、温存エネルギーを使ってシールドする
  const incomingPunch = data.punches.find(
    punch =>
      punch.color !== data.color &&
      punch.distance <= PUNCH_SHIELD_DISTANCE
  );
  if (incomingPunch && data.energy >= 4) {
    postMessage({action: {type: "shield"}});
    return;
  }

  const incomingBullet = data.bullets
    .filter(bullet => isIncomingBullet(bullet, data))
    .sort((a, b) => a.distance - b.distance)[0];

  if (incomingBullet) {
    const evadeDirection = emergencyEvadeDirection(incomingBullet);
    const canEvade =
      data.energy >= MOVE_COST &&
      emergencyEvadePathIsClear(data, allies, evadeDirection);

    if (canEvade) {
      // 回避時だけ、50の回避用温存エネルギーを使用してよい
      postMessage({
        action: {type: "move", dir: evadeDirection}
      });
      return;
    }

    // 回避先が端または味方で塞がれている時は、衝突直前にシールドする
    if (
      incomingBullet.distance <= BULLET_SHIELD_DISTANCE &&
      data.energy >= 4
    ) {
      postMessage({action: {type: "shield"}});
    } else {
      // 弾丸を引きつけながら、シールド用のエネルギーを確保する
      postMessage({action: {type: "charge"}});
    }
    return;
  }

  const routeBlocker = allies.find(
    ally =>
      ally.distance < target.distance &&
      pointOnRoute(ally, data, target, ROUTE_WIDTH, 18)
  );

  // 味方が進路を塞いでいたら、温存分を残して斜め前方へ迂回する
  if (routeBlocker && target.distance > 6) {
    if (detourFrames <= 0) chooseDetour(data, routeBlocker);
    detourFrames--;

    if (canUseRegularAction(data, MOVE_COST)) {
      advanceSteps++;
      postMessage({
        action: {type: "move", dir: detourDirection}
      });
    } else {
      postMessage({action: {type: "charge"}});
    }
    return;
  }
  detourFrames = 0;

  // 接近戦でも、回避用温存エネルギーには手を付けずに攻撃する
  if (target.distance <= 3) {
    if (Math.abs(target.angle) > 5) {
      if (canUseRegularAction(data, TURN_COST)) {
        postMessage({action: {type: "turn", dir: target.angle}});
      } else {
        postMessage({action: {type: "charge"}});
      }
    } else if (canUseRegularAction(data, PUNCH_COST)) {
      postMessage({action: {type: "punch"}});
    } else {
      postMessage({action: {type: "charge"}});
    }
    return;
  }

  if (Math.abs(target.angle) > 3) {
    if (canUseRegularAction(data, TURN_COST)) {
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

  const timeToShoot =
    advanceSteps >= ADVANCE_STEPS_BEFORE_SHOT &&
    target.distance >= MIN_FIRE_DISTANCE;

  if (timeToShoot) {
    // 射線上に味方がいる間は、温存分を残して横へずれる
    if (friendlyInShotLine) {
      const blocker = allies.find(ally =>
        pointOnRoute(ally, data, target, SHOT_WIDTH, 10)
      );
      if (blocker && detourFrames <= 0) chooseDetour(data, blocker);

      if (canUseRegularAction(data, MOVE_COST)) {
        advanceSteps++;
        postMessage({
          action: {type: "move", dir: detourDirection}
        });
      } else {
        postMessage({action: {type: "charge"}});
      }
      return;
    }

    // 回避用50＋射撃用40が揃うまで停止し、射撃後も50を残す
    if (data.energy >= EVASION_ENERGY_RESERVE + FIRE_COST) {
      advanceSteps = 0;
      postMessage({action: {type: "fire"}});
    } else {
      postMessage({action: {type: "charge"}});
    }
    return;
  }

  // 前進中も、50の回避用温存エネルギーを下回らない
  if (canUseRegularAction(data, MOVE_COST)) {
    advanceSteps++;
    postMessage({action: {type: "move", dir: 0}});
  } else {
    postMessage({action: {type: "charge"}});
  }
};
