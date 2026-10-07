/**
 * RBAC matrix: every route of every controller is discovered from Nest metadata and called anonymously and as
 * each of the six roles. Expectations: anonymous -> 401 (unless @Public), a role outside @Roles -> 403, an
 * allowed role never gets 401/role-403/500; a malformed id gives 404 (or 400 for invalid bodies), never 500.
 */
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../src/common/decorators';
import { Role } from '../src/generated/prisma/client';
import { Api, anon, buildWorld, login, World } from './fixtures';
import { createTestApp, resetDatabase, TestContext } from './helpers';

interface RouteInfo {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  roles: Role[] | null;
  isPublic: boolean;
}

const VERB: Record<number, RouteInfo['method'] | undefined> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
};

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

function discover(ctx: TestContext): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const modules = ctx.app.get(ModulesContainer);
  for (const mod of modules.values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!ctrl) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, ctrl) as string | undefined) ?? '';
      const classRoles = Reflect.getMetadata(ROLES_KEY, ctrl) as Role[] | undefined;
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, ctrl) as boolean | undefined;
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const handler = proto[name];
        if (typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const verb = VERB[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        if (sub === undefined || !verb) continue;
        routes.push({
          method: verb,
          path: join('api', base, sub),
          roles: (Reflect.getMetadata(ROLES_KEY, handler) as Role[] | undefined) ?? classRoles ?? null,
          isPublic: Boolean(
            (Reflect.getMetadata(IS_PUBLIC_KEY, handler) as boolean | undefined) ?? classPublic,
          ),
        });
      }
    }
  }
  return routes;
}

const fill = (path: string, id: string) =>
  path.replace(/:kind/g, 'photo').replace(/:[a-zA-Z]+/g, id);

/** Routes whose side effects would end the test sessions or are covered elsewhere. */
const SKIP = new Set(['post /api/auth/logout']);

const ROLES: Role[] = ['LITIGANT', 'LAWYER', 'INTERN', 'PROCESS_SERVER', 'JUDGE', 'ADMIN'];

describe('RBAC matrix (e2e)', () => {
  let ctx: TestContext;
  let w: World;
  let routes: RouteInfo[];
  const as: Partial<Record<Role, Api>> = {};
  const problems: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    w = await buildWorld(ctx.prisma);
    as.LITIGANT = await login(ctx, w.emails.litigant);
    as.LAWYER = await login(ctx, w.emails.lawyer);
    as.INTERN = await login(ctx, w.emails.intern);
    as.PROCESS_SERVER = await login(ctx, w.emails.server);
    as.JUDGE = await login(ctx, w.emails.judge);
    as.ADMIN = await login(ctx, w.emails.admin);
    routes = discover(ctx).filter((r) => !SKIP.has(`${r.method} ${r.path}`));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /** Refused admin-route calls are recorded as security events; clear them so no test session is killed. */
  const calm = () => ctx.prisma.securityEvent.deleteMany();

  it('discovers the whole API surface', () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it('answers 401 to anonymous callers on every protected route', async () => {
    for (const r of routes.filter((x) => !x.isPublic)) {
      const res = await anon(ctx)[r.method](fill(r.path, randomUUID())).send({});
      if (res.status !== 401) problems.push(`anon ${r.method} ${r.path} -> ${res.status}`);
    }
    expect(problems.filter((p) => p.startsWith('anon'))).toEqual([]);
  });

  it.each(ROLES)('enforces @Roles for %s', async (role) => {
    const found: string[] = [];
    for (const r of routes) {
      await calm();
      const res = await as[role]![r.method](fill(r.path, randomUUID())).send({});
      const roleForbidden =
        res.status === 403 && /permission to access this resource/i.test(res.body?.message ?? '');
      if (r.roles && !r.roles.includes(role)) {
        if (res.status !== 403) found.push(`${role} ${r.method} ${r.path} expected 403 got ${res.status}`);
      } else if (res.status >= 500 || res.status === 401 || roleForbidden) {
        found.push(`${role} ${r.method} ${r.path} allowed but got ${res.status} ${res.body?.message ?? ''}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('answers 404 (or 400 for an invalid body), never 500, to malformed ids', async () => {
    const found: string[] = [];
    for (const r of routes.filter((x) => /:(?!kind)[a-zA-Z]+/.test(x.path))) {
      const role = r.roles?.[0] ?? 'ADMIN';
      await calm();
      const res = await as[role]![r.method](fill(r.path, 'not-a-uuid')).send({});
      if (![400, 404].includes(res.status)) found.push(`${role} ${r.method} ${r.path} -> ${res.status}`);
    }
    expect(found).toEqual([]);
  });
});
