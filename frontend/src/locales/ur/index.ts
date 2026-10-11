import admin from './admin.json';
import auth from './auth.json';
import cases from './cases.json';
import chamber from './chamber.json';
import common from './common.json';
import errors from './errors.json';
import fees from './fees.json';
import glossary from './glossary.json';
import hearings from './hearings.json';
import intern from './intern.json';
import judge from './judge.json';
import landing from './landing.json';
import summons from './summons.json';
import validation from './validation.json';

/** All Urdu namespaces merged into the single runtime namespace (keys are unique across files). */
const bundle: Record<string, string> = {
  ...common,
  ...auth,
  ...landing,
  ...cases,
  ...fees,
  ...hearings,
  ...summons,
  ...chamber,
  ...intern,
  ...judge,
  ...admin,
  ...validation,
  ...errors,
  ...glossary,
};

export default bundle;
