import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function authFixture({ childAlreadyExists = false, usernameTaken = false } = {}) {
  const parent = { id: "parent-test", username: "old-name", email: "test@example.com" };
  const signupChild = {
    id: "new-child", childName: "Demo Learner", dateOfBirth: "2022-05-18", pinCode: "6274",
  };
  const children = [{ id: "older-child", childName: "Existing Learner" }];
  if (childAlreadyExists) children.push(signupChild);
  const user = {
    id: "auth-test", email: parent.email, email_confirmed_at: "2026-11-15",
    user_metadata: {
      username: "new-name", pending_registration: true, child_name: signupChild.childName,
      child_first_name: "Demo", child_last_name: "Learner", child_date_of_birth: signupChild.dateOfBirth,
      child_pin_code: signupChild.pinCode,
    },
  };
  const client = {
    auth: {
      signInWithPassword: async () => ({ data: { user }, error: null }),
      updateUser: async ({ data }) => { Object.assign(user.user_metadata, data); return { error: null }; },
    },
    from() {
      const filters = [];
      let update;
      const query = {
        select: () => query,
        eq: (field, value) => { filters.push([field, value]); return query; },
        update: value => { update = value; return query; },
        maybeSingle: async () => {
          const match = filters.every(([field, value]) => parent[field] === value);
          if (match) {
            if (update) Object.assign(parent, update);
            return { data: { ...parent }, error: null };
          }
          const conflict = usernameTaken && filters.some(([field, value]) => field === "username" && value === "new-name");
          return { data: conflict ? { id: "another-parent", username: "new-name", email: "other@example.com" } : null, error: null };
        },
      };
      return query;
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync("src/backend/supabaseAuth.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, console,
    require: path => path === "./supabase" ? { supabase: client, pendingEmailLink: {} } : {
      getParentChildren: async () => children,
      createChildProfile: async (_unused, child) => children.push({ ...child, id: signupChild.id }),
    },
  });
  return { ...module.exports, parent, user, children };
}

test("verified signup recovers its existing email profile and adds its new child", async () => {
  const fixture = authFixture();
  const id = await fixture.completePendingParentRegistration(fixture.user);
  assert.equal(id, fixture.parent.id);
  assert.equal(fixture.parent.username, "old-name");
  assert.equal(fixture.children.length, 2);
  assert.equal(fixture.children[0].childName, "Existing Learner");
  assert.equal(fixture.children[1].childName, "Demo Learner");
  assert.equal(fixture.user.user_metadata.pending_registration, false);
  await fixture.completePendingParentRegistration(fixture.user);
  assert.equal(fixture.children.length, 2);
});

test("finishing a retried signup preserves an already-created child", async () => {
  const fixture = authFixture({ childAlreadyExists: true });
  await fixture.completePendingParentRegistration(fixture.user);
  assert.equal(fixture.children.length, 2);
});

test("email login returns the recovered profile's canonical username", async () => {
  const fixture = authFixture();
  const signedIn = await fixture.signInParentAccount("test@example.com", "test-password");
  assert.equal(signedIn.username, "old-name");
  assert.equal(signedIn.id, fixture.parent.id);
});

test("an email callback redirects once and cannot send the login page back to confirmation", () => {
  const app = ts.createSourceFile("App.tsx", readFileSync("src/frontend/App.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const redirect = app.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "AuthEmailRedirect");
  const source = ts.transpileModule(redirect.getText(app), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const ref = { current: false };
  const destinations = [];
  let path = "/";
  const context = {
    useRef: () => ref,
    useEffect: callback => callback(),
    useNavigate: () => (destination) => { path = destination; destinations.push(destination); },
    pendingEmailLink: { path: "/", type: "signup" },
    EMAIL_VERIFIED_PATH: "/email-verified",
    RESET_PASSWORD_PATH: "/reset-password",
    window: { location: { get pathname() { return path; } } },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.AuthEmailRedirect();
  assert.deepEqual(destinations, ["/email-verified"]);
  path = "/app/signin";
  context.AuthEmailRedirect();
  assert.equal(path, "/app/signin");
  assert.deepEqual(destinations, ["/email-verified"]);
});
