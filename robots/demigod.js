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
const EVASION_COLLISION_MARGIN = 11;
const EVASION_CLEARANCE = 12;
const ROBOT_RADIUS = 10;
const FIELD_WIDTH = 400;
const FIELD_HEIGHT = 600;

const MIN_FIRE_DISTANCE = 35;
const ADVANCE_STEPS_BEFORE_SHOT = 30;
const ROUTE_WIDTH = 24;
const SHOT_WIDTH = 14;
const PUNCH_HIT_DISTANCE = ROBOT_RADIUS * 2;
const RANGED_SUPPORT_MEMORY = 45;
const SUPPORT_STRAFE_DISTANCE = 18;

let detourDirection = 60;
let detourFrames = 0;
let advanceSteps = 0;
let rangedSupportFrames = 0;
let rangedSupportTarget = null;

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

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function friendlyIsInShotPath(ally, start, target) {
  const shotX = target.x - start.x;
  const shotY = target.y - start.y;
  const shotLength = Math.hypot(shotX, shotY);
  if (shotLength === 0) return false;

  const allyX = ally.x - start.x;
  const allyY = ally.y - start.y;
  const projection =
    (allyX * shotX + allyY * shotY) / shotLength;
  if (projection <= 5 || projection >= shotLength) return false;

  const perpendicular =
    Math.abs(allyX * shotY - allyY * shotX) / shotLength;
  return perpendicular < SHOT_WIDTH;
}

function friendlyWouldBeHitByPunch(data, allies) {
  const angle = data.dir * Math.PI / 180;
  const punchCenter = {
    x: data.x + ROBOT_RADIUS * Math.cos(angle),
    y: data.y + ROBOT_RADIUS * Math.sin(angle)
  };
  return allies.some(
    ally => distanceBetween(ally, punchCenter) < PUNCH_HIT_DISTANCE
  );
}

function regularMovePathIsClear(data, allies, direction) {
  const angle = (data.dir - direction) * Math.PI / 180;

  for (let distance = 6; distance <= SUPPORT_STRAFE_DISTANCE; distance += 6) {
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

function chooseSupportStrafe(data, allies, blocker) {
  const preferred = blocker.angle >= 0 ? 90 : -90;
  return [preferred, -preferred].find(direction =>
    regularMovePathIsClear(data, allies, direction)
  ) ?? null;
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

function evaluateEmergencyEvasion(bullet, data, allies, direction) {
  const bulletSpeed = Math.hypot(bullet.vx, bullet.vy);
  if (bulletSpeed === 0 || data.energy < MOVE_COST) return null;

  const bulletUnitX = bullet.vx / bulletSpeed;
  const bulletUnitY = bullet.vy / bulletSpeed;
  const toRobotX = data.x - bullet.x;
  const toRobotY = data.y - bullet.y;
  const framesToClosestPoint =
    (toRobotX * bullet.vx + toRobotY * bullet.vy) /
    (bulletSpeed * bulletSpeed);
  if (framesToClosestPoint < 0) return null;

  // 衝突予測までに実行できる移動回数を、その時点のエネルギーも含めて計算
  const framesUntilImpact = Math.max(1, Math.ceil(framesToClosestPoint));
  const energyLimitedSteps = Math.max(0, Math.floor(data.energy) - 1);
  const availableSteps = Math.min(framesUntilImpact, energyLimitedSteps);
  if (availableSteps === 0) return null;

  const moveAngle = (data.dir - direction) * Math.PI / 180;
  const moveX = Math.cos(moveAngle);
  const moveY = Math.sin(moveAngle);

  // 弾道に対して横へ移動できる幅が、必要な回避幅に届くかを先に確認
  const normalX = -bulletUnitY;
  const normalY = bulletUnitX;
  const currentLateralOffset =
    toRobotX * normalX + toRobotY * normalY;
  const lateralMovePerStep =
    moveX * normalX + moveY * normalY;
  const finalLateralOffset =
    currentLateralOffset + lateralMovePerStep * availableSteps;
  const availableEvasionWidth =
    Math.max(0, Math.abs(finalLateralOffset) - Math.abs(currentLateralOffset));
  const requiredEvasionWidth =
    Math.max(0, EVASION_CLEARANCE - Math.abs(currentLateralOffset));

  if (availableEvasionWidth < requiredEvasionWidth) return null;

  // 実際の更新単位で、フィールド端・味方・弾丸との位置関係を先読みする
  const framesToCheck = framesUntilImpact + 2;
  for (let frame = 1; frame <= framesToCheck; frame++) {
    const movedSteps = Math.min(frame, availableSteps);
    const robotX = data.x + moveX * movedSteps;
    const robotY = data.y + moveY * movedSteps;

    if (
      robotX < ROBOT_RADIUS ||
      robotX > FIELD_WIDTH - ROBOT_RADIUS ||
      robotY < ROBOT_RADIUS ||
      robotY > FIELD_HEIGHT - ROBOT_RADIUS
    ) {
      return null;
    }

    if (
      allies.some(ally =>
        Math.hypot(ally.x - robotX, ally.y - robotY) <
        ROBOT_RADIUS * 2 + 4
      )
    ) {
      return null;
    }

    const bulletX = bullet.x + bullet.vx * frame;
    const bulletY = bullet.y + bullet.vy * frame;
    if (
      Math.abs(robotX - bulletX) < EVASION_COLLISION_MARGIN &&
      Math.abs(robotY - bulletY) < EVASION_COLLISION_MARGIN
    ) {
      return null;
    }
  }

  return {
    direction,
    availableEvasionWidth,
    requiredEvasionWidth,
    finalClearance: Math.abs(finalLateralOffset)
  };
}

function calculateEmergencyEvasion(bullet, data, allies) {
  // 入射側の反対を優先しつつ、左右両方の斜め前方を計算する
  const preferredDirection = bullet.angle >= 0 ? 45 : -45;
  return [preferredDirection, -preferredDirection]
    .map(direction =>
      evaluateEmergencyEvasion(bullet, data, allies, direction)
    )
    .filter(Boolean)
    .sort((a, b) => b.finalClearance - a.finalClearance)[0] || null;
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
    const evasion = calculateEmergencyEvasion(
      incomingBullet,
      data,
      allies
    );

    if (evasion) {
      // 必要な回避幅を確保できる時だけ、温存エネルギーで緊急回避する
      postMessage({
        action: {type: "move", dir: evasion.direction}
      });
      return;
    }

    // 移動幅が足りない時や、端・味方で塞がれている時は直前にシールドする
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

  const friendlyPunchNearTarget = data.punches.some(
    punch =>
      punch.color === data.color &&
      distanceBetween(punch, target) <= PUNCH_HIT_DISTANCE + ROBOT_RADIUS
  );

  if (friendlyPunchNearTarget) {
    rangedSupportFrames = RANGED_SUPPORT_MEMORY;
    rangedSupportTarget = {x: target.x, y: target.y};
  } else if (rangedSupportFrames > 0 && rangedSupportTarget) {
    const sameTarget =
      distanceBetween(rangedSupportTarget, target) <= 40;
    if (sameTarget) {
      rangedSupportFrames--;
      rangedSupportTarget = {x: target.x, y: target.y};
    } else {
      rangedSupportFrames = 0;
      rangedSupportTarget = null;
    }
  }

  if (rangedSupportFrames > 0) {
    // 偶然パンチ圏内にいる場合は、味方を巻き込まない時だけ格闘する
    if (target.distance <= 3) {
      if (Math.abs(target.angle) > 5) {
        if (canUseRegularAction(data, TURN_COST)) {
          postMessage({action: {type: "turn", dir: target.angle}});
        } else {
          postMessage({action: {type: "charge"}});
        }
        return;
      }

      if (!friendlyWouldBeHitByPunch(data, allies)) {
        if (canUseRegularAction(data, PUNCH_COST)) {
          postMessage({action: {type: "punch"}});
        } else {
          postMessage({action: {type: "charge"}});
        }
        return;
      }
    }

    // 味方が格闘中の標的には新たに接近せず、射撃支援へ切り替える
    if (Math.abs(target.angle) > 3) {
      if (canUseRegularAction(data, TURN_COST)) {
        postMessage({action: {type: "turn", dir: target.angle}});
      } else {
        postMessage({action: {type: "charge"}});
      }
      return;
    }

    const supportBlocker = allies.find(ally =>
      friendlyIsInShotPath(ally, data, target)
    );

    if (supportBlocker) {
      // 味方が射線上にいる時だけ横移動し、接近せずに射線を作る
      const strafeDirection =
        chooseSupportStrafe(data, allies, supportBlocker);
      if (
        strafeDirection !== null &&
        canUseRegularAction(data, MOVE_COST)
      ) {
        postMessage({
          action: {type: "move", dir: strafeDirection}
        });
      } else {
        postMessage({action: {type: "charge"}});
      }
      return;
    }

    // 回避用50を残せる90エネルギーまで待ち、安全な射線から射撃する
    if (data.energy >= EVASION_ENERGY_RESERVE + FIRE_COST) {
      postMessage({action: {type: "fire"}});
    } else {
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
    } else if (friendlyWouldBeHitByPunch(data, allies)) {
      postMessage({action: {type: "charge"}});
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
    friendlyIsInShotPath(ally, data, target)
  );

  const timeToShoot =
    advanceSteps >= ADVANCE_STEPS_BEFORE_SHOT &&
    target.distance >= MIN_FIRE_DISTANCE;

  if (timeToShoot) {
    // 射線上に味方がいる間は、温存分を残して横へずれる
    if (friendlyInShotLine) {
      const blocker = allies.find(ally =>
        friendlyIsInShotPath(ally, data, target)
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
