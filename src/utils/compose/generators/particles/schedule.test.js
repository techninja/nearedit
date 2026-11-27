import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveParams } from '../../params.js';
import { PARAMS } from './schema.js';
import { countAlive, eachAlive, planOf } from './schedule.js';

/** Resolved parameters: steady lifetimes unless a test asks for variation. */
const params = (over = {}, seed = 7) => ({
  seed,
  ...resolveParams(PARAMS, { lifetimeJitter: 0, ...over }),
});

/** Everything alive at a time, as `{ id, age, span, born, group, index }`. */
function alive(p, t) {
  const list = [];
  eachAlive(planOf(p), t, (seed, index, group, age, span, born) => {
    list.push({ id: `${seed}:${group}:${index}`, index, group, age, span, born });
  });
  return list;
}

describe('the birth schedule', () => {
  it('gives every slot of 1 / rate seconds exactly one birth', () => {
    const p = params({ rate: 10, lifetime: 1000 });
    const births = alive(p, 20).map((particle) => particle.born);
    assert.equal(births.length, 200);
    births.forEach((born, n) => {
      assert.ok(born >= n / 10 && born < (n + 1) / 10, `birth ${n} at ${born}`);
    });
    const offsets = births.map((born, n) => born * 10 - n);
    const mean = offsets.reduce((sum, o) => sum + o, 0) / offsets.length;
    assert.ok(Math.abs(mean - 0.5) < 0.08, `births cluster in their slots: mean ${mean}`);
    assert.ok(new Set(offsets.map((o) => o.toFixed(3))).size > 150, 'no regular cadence');
  });

  it('keeps rate × lifetime particles alive once it has filled', () => {
    const p = params({ rate: 100, lifetime: 2 });
    for (const t of [2.5, 7.31, 40]) {
      const count = countAlive(p, t);
      assert.ok(Math.abs(count - 200) <= 1, `${count} alive at ${t}`);
    }
    // A lifetime that varies by half averages three quarters of the longest.
    const varied = countAlive(params({ rate: 100, lifetime: 2, lifetimeJitter: 0.5 }), 9);
    assert.ok(Math.abs(varied - 150) < 15, `${varied} alive with varied lifetimes`);
    for (const particle of alive(params({ rate: 50, lifetime: 2, lifetimeJitter: 0.5 }), 9)) {
      assert.ok(particle.span >= 1 && particle.span <= 2, `lifetime ${particle.span}`);
      assert.ok(particle.age >= 0 && particle.age < particle.span);
    }
  });

  it('starts empty and fills up — or starts full with prewarm', () => {
    const p = params({ rate: 100, lifetime: 2 });
    assert.equal(countAlive(p, 0), 0);
    assert.equal(countAlive(p, -3), 0, 'nothing before the clip-local zero');
    assert.ok(Math.abs(countAlive(p, 1) - 100) <= 1, 'half full after half a lifetime');
    const warm = { ...p, prewarm: true };
    for (const t of [-3, 0, 0.5, 1, 12]) {
      assert.ok(
        Math.abs(countAlive(warm, t) - 200) <= 1,
        `prewarmed, ${countAlive(warm, t)} at ${t}`,
      );
    }
    // Once the cold start has filled, the two fields are the same particles.
    assert.deepEqual(alive(warm, 5), alive(p, 5));
  });

  it('stops emitting after emitFor and lets the living live out', () => {
    const p = params({ rate: 10, lifetime: 2, emitFor: 1 });
    assert.equal(countAlive(p, 1.5), 10, 'ten were born in the first second');
    assert.deepEqual(
      alive(p, 1.5).map((particle) => particle.index),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    assert.ok(alive(p, 2.5).every((particle) => particle.born > 0.5));
    assert.ok(countAlive(p, 2.5) >= 4 && countAlive(p, 2.5) <= 6);
    assert.equal(countAlive(p, 3.1), 0);
  });

  it('throws a burst all at once, once', () => {
    const p = params({ rate: 0, burst: 50, lifetime: 2 });
    assert.equal(countAlive(p, -0.1), 0);
    const now = alive(p, 0.4);
    assert.equal(now.length, 50);
    assert.ok(now.every((particle) => particle.born === 0 && particle.age === 0.4));
    assert.equal(countAlive(p, 1.99), 50);
    assert.equal(countAlive(p, 2), 0);
    assert.equal(countAlive({ ...p, prewarm: true }, -0.1), 0, 'a single burst has no past');
  });

  it('repeats the burst on an interval, each one a different set', () => {
    const p = params({ rate: 0, burst: 20, burstEvery: 0.5, lifetime: 0.8 });
    const now = alive(p, 0.6);
    assert.equal(now.length, 40);
    assert.deepEqual([...new Set(now.map((particle) => particle.born))], [0, 0.5]);
    assert.equal(new Set(now.map((particle) => particle.id)).size, 40);
    assert.equal(countAlive(p, 0.9), 20, 'the first burst has died');
    assert.equal(countAlive({ ...p, emitFor: 1 }, 1.2), 20, 'bursts stop with the emission');
    assert.equal(countAlive({ ...p, emitFor: 1 }, 1.4), 0);
    assert.equal(countAlive({ ...p, prewarm: true }, 0.1), 40, 'prewarmed bursts reach back');
  });

  it('adds the stream and the bursts', () => {
    const p = params({ rate: 100, burst: 30, lifetime: 2 });
    assert.ok(Math.abs(countAlive(p, 1) - 130) <= 1);
  });
});

describe('the cap on particles alive', () => {
  const greedy = params({ rate: 20000, burst: 20000, burstEvery: 0.1, lifetime: 10 });

  it('never lets more than maxParticles live, however much is asked for', () => {
    assert.ok(planOf(greedy).kept < 0.002);
    for (const maxParticles of [10, 500, 3000, 20000]) {
      let most = 0;
      for (let t = 0; t < 40; t += 0.37) {
        most = Math.max(most, countAlive({ ...greedy, maxParticles, prewarm: t > 20 }, t));
      }
      assert.ok(most <= maxParticles, `${most} alive with a cap of ${maxParticles}`);
      // A hundred overlapping bursts cannot share ten particles: each gets none.
      if (maxParticles >= 500) {
        assert.ok(most >= maxParticles * 0.85, `only ${most} of ${maxParticles} used`);
      }
    }
  });

  it('thins the births instead of cutting lives short', () => {
    const p = { ...greedy, maxParticles: 400 };
    const then = alive(p, 12);
    const later = new Map(alive(p, 14).map((particle) => [particle.id, particle]));
    assert.ok(then.length > 300);
    for (const particle of then) {
      const still = later.get(particle.id);
      if (particle.age + 2 < particle.span) {
        assert.ok(still, `particle ${particle.id} vanished before its time`);
        assert.ok(Math.abs(still.age - particle.age - 2) < 1e-9);
      } else {
        assert.equal(still, undefined);
      }
    }
  });

  it('leaves a modest request alone', () => {
    const plan = planOf(params({ rate: 100, burst: 50, lifetime: 3 }));
    assert.equal(plan.kept, 1);
    assert.equal(plan.rate, 100);
    assert.equal(plan.burst, 50);
  });
});

describe('statelessness of the schedule', () => {
  it('finds the same particles at a time whatever was asked before', () => {
    const p = params({ rate: 60, burst: 25, burstEvery: 0.7, lifetime: 1.5, lifetimeJitter: 0.4 });
    const first = alive(p, 5.25);
    for (const t of [0.1, 9, 5.25, 3, 5.25]) alive(p, t);
    assert.deepEqual(alive(p, 5.25), first);
    assert.notDeepEqual(alive({ ...p, seed: 8 }, 5.25), first, 'another seed, other particles');
  });

  it('ages every particle by exactly the time that passes', () => {
    const p = params({ rate: 40, burst: 10, burstEvery: 1, lifetime: 3 });
    const before = new Map(alive(p, 4).map((particle) => [particle.id, particle]));
    for (const particle of alive(p, 4.5)) {
      const was = before.get(particle.id);
      if (was) assert.ok(Math.abs(particle.age - was.age - 0.5) < 1e-9);
      else assert.ok(particle.age < 0.5, 'a newcomer is younger than the step');
    }
  });
});
