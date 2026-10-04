import type { Object3D } from 'three';
import type { Game } from '../src/game/Game';
import { getRescueCondition } from '../src/game/RescueMission';

type Point = readonly [number, number];
interface Stage {
  label: string;
  route: readonly Point[];
  yaw: number;
  action: 'rescue' | 'full' | 'unload';
  site?: 'A' | 'B' | 'C';
  expectedAboard: number;
  expectedSafe: number;
}

const toCamp: readonly Point[] = [[27.8, -6], [26.5, -6], [26.5, 14], [24, 14], [24, 19.5]];
const toRoof: readonly Point[] = [[24, 14], [26.5, 14], [26.5, -6], [27.8, -6], [27.8, -12]];
const stages: readonly Stage[] = [
  { label: 'A · board two', route: [[0, -18]], yaw: 0, action: 'rescue', site: 'A', expectedAboard: 2, expectedSafe: 0 },
  { label: 'B · third passenger', route: [[0, -12], [0, 4.2], [-15, 4.2]], yaw: 0, action: 'rescue', site: 'B', expectedAboard: 3, expectedSafe: 0 },
  { label: 'C · reject fourth passenger', route: [[0, 4.2], [0, 12.8], [24, 12.8], [26.5, 12.8], [26.5, -6], [27.8, -6], [27.8, -12]], yaw: Math.PI / 2, action: 'full', site: 'C', expectedAboard: 3, expectedSafe: 0 },
  { label: 'CAMP · first delivery', route: toCamp, yaw: Math.PI, action: 'unload', expectedAboard: 0, expectedSafe: 3 },
  { label: 'C · board remaining three', route: toRoof, yaw: Math.PI / 2, action: 'rescue', site: 'C', expectedAboard: 3, expectedSafe: 3 },
  { label: 'CAMP · final delivery', route: toCamp, yaw: Math.PI, action: 'unload', expectedAboard: 0, expectedSafe: 6 },
];

/** Real keyboard events and real boat motion: no teleports, mission mutation, or skipped transfers. */
export function runBrowserSmoke(game: Game) {
  // Exercise the actual menu route before steering the six-person mission.
  document.querySelector<HTMLButtonElement>('#level-select-button')!.click();
  document.querySelector<HTMLButtonElement>('[data-level="2"]')!.click();
  document.querySelector<HTMLButtonElement>('#level-start-button')!.click();
  document.querySelector<HTMLButtonElement>('#skip-video-button')!.click();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));

  document.getElementById('smoke-status')?.remove();
  const status = document.createElement('pre');
  status.id = 'smoke-status';
  status.style.cssText = 'position:fixed;left:16px;bottom:78px;margin:0;padding:10px 12px;background:#132729e8;color:#cff3d7;z-index:80;font:11px/1.5 monospace;pointer-events:none';
  document.body.append(status);
  const keys = new Set<string>();
  const key = (code: string, active: boolean) => {
    if (keys.has(code) === active) return;
    if (active) keys.add(code); else keys.delete(code);
    window.dispatchEvent(new KeyboardEvent(active ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  const release = () => [...keys].forEach(code => key(code, false));
  const interact = () => { key('KeyE', true); key('KeyE', false); };
  const angleDifference = (target: number, yaw: number) => Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  const begun = performance.now();
  let stageIndex = 0, waypointIndex = 0, frames = 0;
  let finished = false, actionStarted = false;
  let dockStableSince = 0;
  let firstDeliveryPositions: number[][] | null = null;
  let lastSafeCount = 0;
  let fourthPassengerRejected = false;

  function require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }
  function visibleInScene(object: Object3D) {
    let current: Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      if (current === game.scene) return true;
      current = current.parent;
    }
    return false;
  }
  function checkPassengers() {
    const { mission, boat } = game;
    require(mission.passengers.count <= 3, 'capacity exceeded three survivors');
    require(boat.driver.root.parent === boat.visual && visibleInScene(boat.driver.root), 'driver left the boat or became hidden');
    for (const person of mission.survivors) {
      require(visibleInScene(person.character), `${person.id} disappeared from the scene`);
      require(person.character.children.length > 0, `${person.id} has no loaded or fallback character`);
      if (person.state === 'PASSENGER') {
        require(person.character.parent === mission.passengers.seatOf(person), `${person.id} does not follow its assigned seat`);
      }
      if (person.state === 'SAFE') {
        require(person.character.parent === person.root, `${person.id} remains attached to the boat after delivery`);
        const position = person.character.position;
        require(position.x >= 19 && position.x <= 29 && position.z >= 22.5 && position.z <= 27.5,
          `${person.id} is outside the camp deck`);
      }
    }
    require(mission.safeCount >= lastSafeCount, 'a delivered survivor was counted backwards');
    lastSafeCount = mission.safeCount;
    if (firstDeliveryPositions) {
      mission.survivors.filter(person => person.locationId !== 'C').forEach((person, index) => {
        const position = firstDeliveryPositions![index];
        require(person.state === 'SAFE' && person.character.position.toArray().every((value, axis) => Math.abs(value - position[axis]) < 0.001),
          `${person.id} did not remain at camp during the return trip`);
      });
    }
  }
  function nextStage() {
    release();
    const stage = stages[stageIndex];
    require(game.mission.passengers.count === stage.expectedAboard, `${stage.label}: wrong passenger count`);
    require(game.mission.safeCount === stage.expectedSafe, `${stage.label}: wrong delivered count`);
    checkPassengers();
    console.info(`[Smoke] ${stage.label} passed · ${game.mission.passengers.count}/3 aboard · ${game.mission.safeCount}/6 safe · ${game.mission.trips} trips`);
    if (stage.action === 'unload' && stage.expectedSafe === 3) {
      require(game.mission.trips === 1, 'first unloading must count exactly one trip');
      require(game.mission.phase !== 'complete', 'mission ended after the first delivery');
      firstDeliveryPositions = game.mission.survivors.filter(person => person.state === 'SAFE').map(person => person.character.position.toArray());
    }
    stageIndex++; waypointIndex = 0; actionStarted = false; dockStableSince = 0;
  }
  function navigate(point: Point) {
    const boat = game.boat.controller;
    const dx = point[0] - boat.position.x, dz = point[1] - boat.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.65 && boat.speed < 0.3) {
      release(); waypointIndex++; return;
    }
    const error = angleDifference(Math.atan2(-dx, -dz), boat.yaw);
    const aligned = Math.abs(error) < 0.3;
    const goal = !aligned || distance < 0.55 ? 0 : Math.min(5.2, Math.max(0.45, distance * 0.82));
    key('KeyA', error > 0.035); key('KeyD', error < -0.035);
    key('KeyW', aligned && distance >= 0.55 && boat.speed < goal);
    key('Space', goal === 0 || boat.speed > goal + 0.12);
  }
  function alignDock(yaw: number, now: number) {
    const boat = game.boat.controller;
    const error = angleDifference(yaw, boat.yaw);
    key('KeyW', false); key('Space', true);
    key('KeyA', error > 0.035); key('KeyD', error < -0.035);
    if (Math.abs(error) > 0.07 || boat.speed > 0.3) { dockStableSince = 0; return false; }
    if (!dockStableSince) dockStableSince = now;
    return now - dockStableSince > 250;
  }
  function loop(now: number) {
    if (finished) return;
    frames++;
    const boat = game.boat.controller, mission = game.mission;
    const stage = stages[stageIndex];
    status.textContent = `LEVEL 2 PLAYTEST · ${mission.phase}${game.paused ? ' · paused' : ''}\n${stage?.label ?? 'checking results'} · waypoint ${waypointIndex + 1}/${stage?.route.length ?? 0}\n${mission.passengers.count}/3 aboard · ${mission.safeCount}/6 safe · trips ${mission.trips}\nx ${boat.position.x.toFixed(1)}  z ${boat.position.z.toFixed(1)} · ${(boat.speed * 3.6).toFixed(1)} km/h`;
    try {
      require(now - begun <= 480_000, 'timed out after eight minutes');
      require(mission.survivors.length === 6, 'Level 2 must contain six active survivors');
      require(mission.phase !== 'failed', 'boat was damaged before the rescue loop finished');
      if (game.paused) { release(); requestAnimationFrame(loop); return; }
      checkPassengers();
      if (!stage) {
        require(fourthPassengerRejected, 'fourth passenger rejection was not tested');
        require(mission.phase === 'complete' && mission.safeCount === 6 && mission.trips === 2, 'mission did not finish with six people in two trips');
        require(game.supplies.treated === 2, 'both injured people must receive first aid before boarding');
        require(game.supplies.donated > 0 && game.supplies.coins === 0, 'recovered coins must be donated at camp');
        require(mission.survivors.every(person => person.state === 'SAFE' && visibleInScene(person.character)), 'six SAFE characters must remain visible in the scene');
        release(); finished = true; status.dataset.result = 'pass';
        const fps = Math.round(frames * 1000 / (now - begun));
        status.textContent += `\nPASS · 6 safe · 2 treated · ${game.supplies.donated} donated · 2 trips · ${fps} FPS`;
        console.info(`[Smoke] Complete Level 2 acceptance passed · 2 treated · ${game.supplies.donated} coins donated · ${fps} fps average · ${game.renderer.info.render.calls} draw calls · ${game.renderer.info.render.triangles} triangles · six visible SAFE characters + driver`);
        return;
      }
      if (mission.phase === 'treating' || mission.phase === 'boarding' || mission.phase === 'unloading') {
        release(); requestAnimationFrame(loop); return;
      }
      if (waypointIndex < stage.route.length) {
        navigate(stage.route[waypointIndex]); requestAnimationFrame(loop); return;
      }
      if (stage.action === 'unload' && actionStarted) {
        nextStage(); requestAnimationFrame(loop); return;
      }
      if (!alignDock(stage.yaw, now)) { requestAnimationFrame(loop); return; }
      if (stage.action === 'rescue') {
        if (mission.passengers.count === stage.expectedAboard) nextStage();
        else {
          const person = mission.nearestSurvivor;
          require(person && person.locationId === stage.site, `${stage.label}: nearest survivor is at the wrong site`);
          require(getRescueCondition(boat, person.position) === 'ready', `${stage.label}: dock approach does not allow a safe rescue`);
          const needsAid = person.needsAid;
          release(); interact();
          require(needsAid ? game.mission.phase === 'treating' && game.supplies.treatmentKit.visible
            : person.state === 'BOARDING' && game.mission.phase === 'boarding', `${stage.label}: E did not start first aid or boarding`);
        }
      } else if (stage.action === 'full') {
        const waiting = mission.nearestSurvivor;
        require(waiting?.locationId === 'C' && getRescueCondition(boat, waiting.position) === 'ready', 'fourth-person attempt was not within rescue range');
        require(mission.getHUD().message === 'BOAT FULL — RETURN TO CAMP', 'full boat did not display the return-to-camp prompt');
        const before = mission.survivors.map(person => person.state).join(',');
        release(); interact();
        require(mission.passengers.count === 3 && mission.survivors.map(person => person.state).join(',') === before,
          'E admitted or changed a fourth survivor while full');
        fourthPassengerRejected = true;
        nextStage();
      } else {
        require(mission.canUnload && mission.getHUD().ready, 'camp arrival did not offer explicit unloading');
        require(mission.safeCount === stage.expectedSafe - 3, 'camp arrival delivered passengers before E');
        release(); interact(); actionStarted = true;
        require(game.mission.phase === 'unloading', 'E did not start passenger disembarking');
        require(mission.survivors.filter(person => person.state === 'DISEMBARKING').length === 1, 'passengers must disembark one at a time');
      }
      requestAnimationFrame(loop);
    } catch (error) {
      release(); finished = true; status.dataset.result = 'fail';
      const message = error instanceof Error ? error.message : String(error);
      status.textContent += `\nFAIL · ${message}`;
      console.error(`[Smoke] ${message}`, error);
    }
  }
  requestAnimationFrame(loop);
}
