// Current authoritative initialization envelope for focused engine/WAL fixtures.
// Tests may still select supported automation versions to exercise that module.
import { INITIAL_METHODS_VERSION } from '../../server/initial_methods.mjs';
import { SIMULATION_RULES_VERSION } from '../../server/simulation_rules.mjs';
export const currentStart = args => ({
 t:'room', name:'start',
 args:{...args,clockRulesVersion:1,initialMethodsVersion:INITIAL_METHODS_VERSION,simulationRulesVersion:SIMULATION_RULES_VERSION},
 state:{initialMethodsVersion:INITIAL_METHODS_VERSION,simulationRulesVersion:SIMULATION_RULES_VERSION,clock:{clockRulesVersion:1,hostSpeed:0}},
});
