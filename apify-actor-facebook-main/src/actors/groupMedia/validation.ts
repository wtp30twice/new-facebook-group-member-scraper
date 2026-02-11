import Joi from 'joi';
import { allActorInputValidationFields } from 'crawlee-one';
import type { FbGroupMemberActorInput } from './config';

// Build marker: if you see this in logs, dist/cjs/actors/groupMedia/validation.js is the one running (with cookies support)
console.log('[groupMedia/validation] loaded — schema includes cookies');

const inputValidationSchema = Joi.object<FbGroupMemberActorInput>({
  ...allActorInputValidationFields,
  maxMembers: Joi.number().integer().min(0).allow(null).optional(),
  cookies: Joi.string().optional(),
} as any).unknown(true);

export const validateInput = (input: FbGroupMemberActorInput | null) => {
  Joi.assert(input, inputValidationSchema);
};
