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
const MELEE_SLOT_DISTANCE = 22;
const MELEE_ENGAGEMENT_DISTANCE = 30;
const MELEE_SLOT_REACHED_DISTANCE = 3;
const PUNCH_HIT_DISTANCE = ROBOT_RADIUS * 2;

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

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function relativeAngleTo(data, point) {
  const absoluteAngle =
    Math.atan2(point.y - data.y, point.x - data.x) * 180 / Math.PI;
  return (absoluteAngle - data.dir + 540) % 360 - 180;
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

function meleeSlotWouldHitFriendly(slot, target, allies) {
  const angle = Math.atan2(target.y - slot.y, target.x - slot.x);
  const punchCenter = {
    x: slot.x + ROBOT_RADIUS * Math.cos(angle),
    y: slot.y + ROBOT_RADIUS * Math.sin(angle)
  };
  return allies.some(
    ally => distanceBetween(ally, punchCenter) < PUNCH_HIT_DISTANCE
  );
}

function findOpenMeleeSlot(data, target, allies) {
  // 相手機体の上下左右を、4つの格闘攻撃位置として扱う
  const candidates = [
    {x: target.x, y: target.y - MELEE_SLOT_DISTANCE},
    {x: target.x + MELEE_SLOT_DISTANCE, y: target.y},
    {x: target.x, y: target.y + MELEE_SLOT_DISTANCE},
    {x: target.x - MELEE_SLOT_DISTANCE, y: target.y}
  ];

  const otherRobots = data.players.filter(player => player !== target);
  return candidates
    .filter(slot =>
      slot.x >= ROBOT_RADIUS &&
      slot.x <= FIELD_WIDTH - ROBOT_RADIUS &&
      slot.y >= ROBOT_RADIUS &&
      slot.y <= FIELD_HEIGHT - ROBOT_RADIUS
    )
    .filter(slot =>
      otherRobots.every(
        robot =>
          distanceBetween(robot, slot) >= ROBOT_RADIUS * 2 + 4
      )
    )
    .filter(slot => !meleeSlotWouldHitFriendly(slot, target, allies))
    .map(slot => {
      const blockers = allies.filter(ally =>
        pointOnRoute(ally, data, slot, ROUTE_WIDTH, 4)
      ).length;
      return {
        ...slot,
        score: distanceBetween(data, slot) + blockers * 100
      };
    })
    .sort((a, b) => a.score - b.score)[0] || null;
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

  const engagedAllies = allies.filter(
    ally => distanceBetween(ally, target) <= MELEE_ENGAGEMENT_DISTANCE
  );
  const friendlyPunchNearTarget = data.punches.some(
    punch =>
      punch.color === data.color &&
      distanceBetween(punch, target) <= PUNCH_HIT_DISTANCE + ROBOT_RADIUS
  );

  if (engagedAllies.length > 0 || friendlyPunchNearTarget) {
    const meleeSlot = findOpenMeleeSlot(data, target, allies);

    // 空いている辺がなければ、味方を巻き込む攻撃はせずに待つ
    if (!meleeSlot) {
      postMessage({action: {type: "charge"}});
      return;
    }

    const distanceToSlot = distanceBetween(data, meleeSlot);
    if (distanceToSlot > MELEE_SLOT_REACHED_DISTANCE) {
      // 選んだ辺までの経路に味方がいれば、斜め前方へ迂回する
      const slotBlocker = allies.find(ally =>
        pointOnRoute(ally, data, meleeSlot, ROUTE_WIDTH, 4)
      );

      if (slotBlocker) {
        if (detourFrames <= 0) chooseDetour(data, slotBlocker);
        detourFrames--;

        if (canUseRegularAction(data, MOVE_COST)) {
          postMessage({
            action: {type: "move", dir: detourDirection}
          });
        } else {
          postMessage({action: {type: "charge"}});
        }
        return;
      }

      detourFrames = 0;
      const slotAngle = relativeAngleTo(data, meleeSlot);
      if (Math.abs(slotAngle) > 4) {
        if (canUseRegularAction(data, TURN_COST)) {
          postMessage({action: {type: "turn", dir: slotAngle}});
        } else {
          postMessage({action: {type: "charge"}});
        }
      } else if (canUseRegularAction(data, MOVE_COST)) {
        postMessage({action: {type: "move", dir: 0}});
      } else {
        postMessage({action: {type: "charge"}});
      }
      return;
    }

    // 空いている辺へ到着してから相手だけを狙ってパンチする
    const meleeAngle = relativeAngleTo(data, target);
    if (Math.abs(meleeAngle) > 4) {
      if (canUseRegularAction(data, TURN_COST)) {
        postMessage({action: {type: "turn", dir: meleeAngle}});
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
