// TEMPORARY STUB: replaced by part A (src/load). Do not build on it.
import type {LoadError, LoadTree} from '../gedcom/types';

export const loadTree: LoadTree = async () => {
  const error = new Error('Loader is not implemented yet') as LoadError;
  error.code = 'NOT_GEDCOM';
  throw error;
};
