// services/types/commandTypes.ts

export interface ParsedPlayerActionParameters {
    withItem?: string | string[];
    on_target?: string;
    is_limb_target?: boolean;
    interaction_type?: string;
    npc_target_name?: string;
    dialogue_text?: string;
    item_to_give_name?: string;
    target_npc_name_for_interaction?: string;
    item_to_request_name?: string;
    target_npc_name_for_request?: string;
    direct_object_npc_id?: string;
    intendedLocationTypeHint?: string;
    examine_detail_target?: string;
    [key: string]: any;
}
export interface ParsedPlayerAction {
  action: string;
  targets: string[];
  parameters: ParsedPlayerActionParameters | null;
  isPlausible: boolean;
  reasonIfNotPlausible: string | null;
  narrationForPlausibleAction: string | null;
}

export type PlayerActionParseResult = ParsedPlayerAction;

export const PLAYER_ACTIONS = {
  DIALOGUE_INPUT: 'dialogue_input',
  END_CONVERSATION: 'end_conversation',
  TALK: 'talk',
  GIVE_ITEM: 'give_item',
  REQUEST_ITEM_FROM_NPC: 'request_item_from_npc',
  ATTACK_NPC: 'attack_npc',
  PICKUP: 'pickup',
  TAKE: 'take',
  GET: 'get',
  USE: 'use',
  EXAMINE: 'examine',
  LOOK: 'look',
  INSPECT: 'inspect',
  DISCOVER_ITEMS: 'discover_items',
  SEARCH_AREA_FOR_ITEMS: 'search_area_for_items',
  DISCOVER_NPCS: 'discover_npcs',
  LOOK_FOR_PEOPLE: 'look_for_people',
  GO: 'go',
  MOVE: 'move',
  WALK: 'walk',
  RUN: 'run',
  LEAVE_AREA: 'leave_area',
  INVENTORY: 'inventory',
  CHECK_INVENTORY: 'check_inventory',
  STATUS: 'status',
  HEALTH: 'health',
  CHECK_SELF: 'check_self',
  CRAFT: 'craft',
  UNKNOWN: 'unknown',
  EVENT_DIALOGUE_INPUT: 'event_dialogue_input',
} as const;

export type PlayerActionType = typeof PLAYER_ACTIONS[keyof typeof PLAYER_ACTIONS];
