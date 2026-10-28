import { quantize } from '../util';
export function ballistic(
  speed: number,
  acceleration: number,
  dt = 0.1,
): { distance: number; speed: number; elapsed: number } {
  if (speed < 0 || !Number.isFinite(speed) || !Number.isFinite(acceleration) || dt <= 0)
    throw new Error('Invalid integration input');
  const elapsed = acceleration < 0 && speed + acceleration * dt < 0 ? -speed / acceleration : dt;
  return {
    distance: speed * elapsed + 0.5 * acceleration * elapsed * elapsed,
    speed: Math.max(0, speed + acceleration * elapsed),
    elapsed,
  };
}
export function idm(
  speed: number,
  target: number,
  gap: number | undefined,
  leaderSpeed: number,
  profile: { a: number; b: number; headway: number; minimumGap: number },
): number {
  const desired =
    profile.minimumGap +
    Math.max(
      0,
      speed * profile.headway +
        (speed * (speed - leaderSpeed)) / (2 * Math.sqrt(profile.a * profile.b)),
    );
  return (
    profile.a *
    (1 - (speed / target) ** 4 - (gap === undefined ? 0 : (desired / Math.max(gap, 1)) ** 2))
  );
}
export function approachAccelerationBound(
  speed: number,
  distance: number,
  nextLimit: number,
  braking: number,
  dt = 0.1,
) {
  const a = dt * dt;
  const b = 2 * speed * dt + braking * dt * dt;
  const c = speed * speed - nextLimit * nextLimit - 2 * braking * (distance - speed * dt);
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
}
export function advance(speed: number, acceleration: number) {
  const result = ballistic(speed, acceleration);
  return { distance: quantize(result.distance), speed: quantize(result.speed) };
}
