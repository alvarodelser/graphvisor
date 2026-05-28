# Neo4j Schema Reference

## Node Types

### `Argument`
| Property | Type | Mandatory |
|---|---|---|
| `argument_id` | Long | ✓ |
| `full_argument` | String | ✓ |
| `argument_type` | String | ✓ |
| `reasoning` | String | ✓ |
| `confidence` | Double | ✓ |

### `Entity`
| Property | Type | Mandatory |
|---|---|---|
| `name` | String | ✓ |
| `reasoning` | String | ✓ |
| `confidence` | Double | ✓ |
| `epistemic_strength` | String | ✓ |
| `source_argument_id` | Long | ✓ |

### `Concept`
| Property | Type | Mandatory |
|---|---|---|
| `name` | String | ✓ |
| `description` | String | ✓ |
| `confidence` | DoubleArray | ✓ |
| `epistemic_strength` | StringArray | ✓ |
| `concept_arg_id` | String | ✓ |

## Relationship Types

### Structural (no properties)
| Relationship | Connects |
|---|---|
| `HAS_SUBJECT` | Argument → Entity |
| `HAS_OBJECT` | Argument → Entity |
| `HAS_CONCEPT` | Argument → Concept |

### Semantic (Argument → Argument, all carry `confidence: Double` and `relation_type: String`)
| Relationship |
|---|
| `CAUSES` |
| `CORRELATES_WITH` |
| `REVEALS` |
| `INDUCES` |
| `MAY_CAUSE` |
| `IS_DEFINED_AS` |
| `DESCRIBES` |
| `SUPPORTS` |
| `INCREASES` |
| `ASSOCIATED_WITH` |
| `INHIBITS` |
| `CONTRADICTS` |

## Notes
- No `Document` node in the current schema — document/embedding data source TBD.
- Entity.`source_argument_id` links back to the originating Argument.
- Concept.`concept_arg_id` links back to the originating Argument.
- All semantic relations are **Argument-to-Argument**.
