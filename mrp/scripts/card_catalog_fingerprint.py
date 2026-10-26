#!/usr/bin/env python3
"""Read-only mechanical identity generator/checker for the shipped card catalogue.

Python standard library only. No design-directory JSON, QA fixture, or JS evaluation.
Run `python3 scripts/card_catalog_fingerprint.py --help` for the CLI contract.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ALGORITHM = 'mrp-card-mechanical-projection-v1'
CARD_FIELDS = ('id', 'cost', 'kind', 'modalities', 'archetypeTags', 'historyTags',
               'effects', 'unlock', 'rarityMultiplier', 'realAbilityEffect')
CARD_DISPLAY_FIELDS = ('art', 'balanceStatus', 'characterCategory', 'characterId',
                       'characterNameDisplayPolicy', 'comboPartners', 'implementationStatus',
                       'mechanicalIntent', 'mechanicalSignature', 'name', 'rulesText',
                       'tier', 'timing', 'unlockEvidence')
POLICY_FIELDS = ('singleplayerOnly', 'actualGainMustNotExceedNormalResourceStep',
                 'preparationEfficiencyRange', 'executionRateRange',
                 'noRarityAbilityMultiplier', 'noBudgetRefund', 'noDrawOrExtraTurn')
POLICY_DISPLAY_FIELDS = ('noCrossCompanyHistoricalAssumption', 'nonLlmIntegrationStatus')
RECIPE_FIELDS = ('schema', 'deckSize', 'mandatoryFallbackId', 'distinctCardsPerRole',
                 'maxActiveRecipes', 'aggregation', 'matchedRoleCoverage',
                 'efficiencyFormula', 'roleMatching')
CATALOG_FIELDS = ('schema', 'status', 'version', 'cards', 'fallback', 'sourceRules', 'caps', 'policy')
DATA_EXPORTS = ('CATALOG_FINGERPRINT', 'POST_CARD_CATALOG', 'POST_CARD_RECIPES')

class CatalogError(ValueError):
    """Unsupported or ambiguous data; never silently relabel it."""


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise CatalogError('Duplicate JSON key: ' + key)
        out[key] = value
    return out


def invalid_constant(value):
    raise CatalogError('Non-finite JSON number: ' + value)


DECODER = json.JSONDecoder(object_pairs_hook=unique_object, parse_constant=invalid_constant)


def skip_space_comments(text, pos):
    while pos < len(text):
        if text[pos].isspace():
            pos += 1
        elif text.startswith('//', pos):
            end = text.find('\n', pos + 2)
            pos = len(text) if end < 0 else end + 1
        elif text.startswith('/*', pos):
            end = text.find('*/', pos + 2)
            if end < 0:
                raise CatalogError('Unclosed JS comment')
            pos = end + 2
        else:
            break
    return pos


def read_data_module(path):
    """Accept only the three existing JSON-literal exports; never eval JS."""
    text = path.read_text(encoding='utf-8')
    pos, exports = 0, {}
    while True:
        pos = skip_space_comments(text, pos)
        if pos == len(text):
            break
        match = re.match(r'export\s+const\s+([A-Z_]+)\s*=\s*', text[pos:])
        if not match:
            raise CatalogError('Catalogue must contain only supported JSON-literal const exports')
        name = match.group(1)
        if name not in DATA_EXPORTS or name in exports:
            raise CatalogError('Unknown/duplicate catalogue export: ' + name)
        pos += match.end()
        value, pos = DECODER.raw_decode(text, pos)
        pos = skip_space_comments(text, pos)
        if pos >= len(text) or text[pos] != ';':
            raise CatalogError('Each catalogue export must be one JSON literal followed by semicolon')
        exports[name] = value
        pos += 1
    if set(exports) != set(DATA_EXPORTS):
        raise CatalogError('Missing catalogue export')
    return exports


def read_rules_version(path):
    # Only the explicit version declaration is read; the gameplay module is never executed.
    text = path.read_text(encoding='utf-8')
    pattern = r"^export\s+const\s+CATALOG_RULES\s*=\s*(['\"])([a-z0-9-]+)\1\s*;"
    found = re.findall(pattern, text, re.MULTILINE)
    if len(found) != 1:
        raise CatalogError('Expected exactly one literal CATALOG_RULES declaration')
    return found[0][1]


def select(obj, keys):
    return {key: obj[key] for key in keys}


def exact_fields(obj, keys, label):
    if not isinstance(obj, dict) or set(obj) != set(keys):
        raise CatalogError(label + ': missing or unclassified fields; review the projection schema')


def validate_shape(catalog, recipes, rules_version):
    exact_fields(catalog, CATALOG_FIELDS, 'catalogue')
    if catalog['schema'] != 'mrp-post-card-catalog-v1':
        raise CatalogError('Unsupported catalogue schema')
    version = catalog['version']
    if version == '166-card-draft-2':
        raise CatalogError('Legacy draft2 fingerprint is a frozen historical constant; do not regenerate or migrate it')
    match = re.fullmatch(r'166-card-draft-([3-9]|[1-9][0-9]+)', str(version))
    if not match:
        raise CatalogError('Unsupported catalogue version: ' + str(version))
    if rules_version != 'bounded-dsl-v1':
        raise CatalogError('Unknown DSL version; review the fingerprint schema before generating identity')
    exact_fields(catalog['policy'], POLICY_FIELDS + POLICY_DISPLAY_FIELDS, 'policy')
    exact_fields(catalog['fallback'], ('existingEngineId', 'countedAsNewMechanicalCard',
                                     'cost', 'base', 'kind', 'policy'), 'fallback')
    if not isinstance(catalog['cards'], list) or len(catalog['cards']) != 166:
        raise CatalogError('Expected the 166-card catalogue')
    ids = set()
    for card in catalog['cards']:
        exact_fields(card, CARD_FIELDS + CARD_DISPLAY_FIELDS, 'card')
        if not isinstance(card['id'], str) or card['id'] in ids:
            raise CatalogError('Duplicate/invalid card ID')
        ids.add(card['id'])
        # Currently these fields have no mechanics; fail closed if their meaning changes.
        if card['comboPartners'] != []:
            raise CatalogError('Nonempty comboPartners requires projection-schema review')
    exact_fields(recipes, RECIPE_FIELDS + ('status', 'recipes'), 'preparation')
    if recipes['schema'] != 'mrp-post-preparation-recipes-v1':
        raise CatalogError('Unsupported preparation schema')
    for recipe in recipes['recipes']:
        exact_fields(recipe, ('id', 'name', 'roles'), 'recipe')


def projection(catalog, recipes, rules_version):
    validate_shape(catalog, recipes, rules_version)
    return {
        'fingerprintSchema': ALGORITHM,
        'rulesVersion': rules_version,
        'catalogSchema': catalog['schema'],
        'catalogVersion': catalog['version'],
        'caps': catalog['caps'],
        'fallback': select(catalog['fallback'], ('existingEngineId', 'cost', 'base', 'kind')),
        'policy': select(catalog['policy'], POLICY_FIELDS),
        'cards': [select(card, CARD_FIELDS) for card in catalog['cards']],
        'preparation': {**select(recipes, RECIPE_FIELDS),
                        'recipes': [select(recipe, ('id', 'roles')) for recipe in recipes['recipes']]},
    }


def normalize(value):
    if isinstance(value, float):
        if not math.isfinite(value):
            raise CatalogError('Non-finite number in mechanical data')
        if value.is_integer():
            return int(value)
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    return value


def canonical_bytes(catalog, recipes, rules_version='bounded-dsl-v1'):
    # This explicit Python encoding is the v1 contract; not an RFC8785 claim.
    data = normalize(projection(catalog, recipes, rules_version))
    return json.dumps(data, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def fingerprint(catalog, recipes, rules_version='bounded-dsl-v1'):
    return hashlib.sha256(canonical_bytes(catalog, recipes, rules_version)).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', nargs='?', choices=('check', 'generate', 'canonical'), default='check',
                        help='check embedded identity (default); generate hash; canonical emits exact hashed bytes')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent,
                        help='main game root; defaults relative to this script, not current working directory')
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve()
        module = read_data_module(root / 'src/career/data/post_card_catalog.js')
        version = read_rules_version(root / 'src/career/sim/post_catalog.js')
        data = canonical_bytes(module['POST_CARD_CATALOG'], module['POST_CARD_RECIPES'], version)
        computed = hashlib.sha256(data).hexdigest()
        embedded = module['CATALOG_FINGERPRINT']
        if not isinstance(embedded, str) or not re.fullmatch(r'[a-f0-9]{64}', embedded):
            raise CatalogError('Malformed embedded CATALOG_FINGERPRINT')
        if args.mode == 'canonical':
            sys.stdout.buffer.write(data)  # Exact canonical bytes, intentionally no newline.
            return 0
        if args.mode == 'generate':
            print(computed)  # Does not write runtime data, saves, logs, or prior evidence.
            return 0
        matched = computed == embedded
        print(json.dumps({'status': 'PASS' if matched else 'MISMATCH', 'algorithm': ALGORITHM,
                          'catalogVersion': module['POST_CARD_CATALOG']['version'],
                          'rulesVersion': version, 'computed': computed, 'embedded': embedded,
                          'readOnly': True}, ensure_ascii=False, indent=2))
        return 0 if matched else 1
    except (CatalogError, OSError, ValueError, KeyError, TypeError) as error:
        print('UNSUPPORTED_OR_INVALID: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
