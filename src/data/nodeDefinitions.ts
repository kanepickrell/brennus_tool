import { TacticNodeDefinition } from '@/types/opfor';

export const nodeDefinitions: TacticNodeDefinition[] = [
  // === PREP: Mise en Place ===
  {
    id: 'prep-chop-vegetables',
    name: 'Chop Vegetables',
    icon: '🔪',
    stage: 'prep',
    category: 'Mise en Place',
    subcategory: 'Cutting',
    description: 'Chop vegetables into uniform pieces for even cooking',
    skillLevel: 'beginner',
    estimatedDuration: 300,
    inputs: [
      { id: 'ingredients', label: 'Raw Vegetables', type: 'RawIngredient', required: true, description: 'Fresh vegetables to chop' },
      { id: 'knife', label: 'Knife', type: 'Knife', required: true, description: 'Chef\'s knife or utility knife' },
    ],
    outputs: [
      { id: 'result', label: 'Chopped Vegetables', type: 'ChoppedVegetables', description: 'Ready for cooking' },
      { id: 'knife-out', label: 'Knife', type: 'Knife', description: 'Pass knife to next step' },
    ],
  },
  {
    id: 'prep-dice-ingredients',
    name: 'Dice Ingredients',
    icon: '🎲',
    stage: 'prep',
    category: 'Mise en Place',
    subcategory: 'Cutting',
    description: 'Dice ingredients into small, uniform cubes',
    skillLevel: 'intermediate',
    estimatedDuration: 420,
    inputs: [
      { id: 'ingredients', label: 'Vegetables', type: 'RawIngredient', required: true, description: 'Vegetables to dice' },
      { id: 'knife', label: 'Knife', type: 'Knife', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Diced Vegetables', type: 'DicedVegetables' },
      { id: 'knife-out', label: 'Knife', type: 'Knife' },
    ],
  },
  {
    id: 'prep-measure-dry',
    name: 'Measure Dry Goods',
    icon: '⚖️',
    stage: 'prep',
    category: 'Mise en Place',
    subcategory: 'Measuring',
    description: 'Measure and portion dry ingredients',
    skillLevel: 'beginner',
    estimatedDuration: 120,
    inputs: [
      { id: 'ingredients', label: 'Dry Ingredients', type: 'RawIngredient', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Measured Ingredients', type: 'RawIngredient' },
    ],
  },
  {
    id: 'prep-marinate',
    name: 'Marinate Protein',
    icon: '🥩',
    stage: 'prep',
    category: 'Mise en Place',
    subcategory: 'Seasoning',
    description: 'Marinate protein for enhanced flavor',
    skillLevel: 'beginner',
    estimatedDuration: 1800,
    inputs: [
      { id: 'protein', label: 'Raw Protein', type: 'RawMeat', required: true },
      { id: 'marinade', label: 'Marinade/Sauce', type: 'Sauce', required: false },
    ],
    outputs: [
      { id: 'result', label: 'Marinated Protein', type: 'MarinatedMeat' },
    ],
  },
  {
    id: 'prep-season',
    name: 'Season Ingredients',
    icon: '🧂',
    stage: 'prep',
    category: 'Mise en Place',
    subcategory: 'Seasoning',
    description: 'Apply dry seasonings and spices',
    skillLevel: 'beginner',
    estimatedDuration: 60,
    inputs: [
      { id: 'ingredients', label: 'Ingredients', type: 'Any', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Seasoned Ingredients', type: 'Any' },
    ],
  },

  // === COOK: Heat Application ===
  {
    id: 'cook-saute',
    name: 'Sauté',
    icon: '🍳',
    stage: 'cook',
    category: 'Heat Application',
    subcategory: 'Pan Cooking',
    description: 'Quick cook ingredients in a pan with oil over high heat',
    skillLevel: 'beginner',
    estimatedDuration: 300,
    inputs: [
      { id: 'ingredients', label: 'Prepped Ingredients', type: 'ChoppedVegetables', required: true },
      { id: 'cookware', label: 'Sauté Pan', type: 'SautéPan', required: true },
      { id: 'heat', label: 'Heat Level', type: 'HeatSetting', required: true, default: 'medium-high' },
    ],
    outputs: [
      { id: 'result', label: 'Sautéed Ingredients', type: 'CookedVegetables' },
      { id: 'pan-out', label: 'Pan', type: 'SautéPan' },
    ],
  },
  {
    id: 'cook-sear',
    name: 'Sear Protein',
    icon: '🔥',
    stage: 'cook',
    category: 'Heat Application',
    subcategory: 'Pan Cooking',
    description: 'High-heat searing for caramelization and crust',
    skillLevel: 'intermediate',
    estimatedDuration: 240,
    inputs: [
      { id: 'protein', label: 'Protein', type: 'MarinatedMeat', required: true },
      { id: 'cookware', label: 'Pan', type: 'SautéPan', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Seared Protein', type: 'CookedProtein' },
      { id: 'pan-out', label: 'Pan', type: 'SautéPan' },
    ],
  },
  {
    id: 'cook-boil',
    name: 'Boil',
    icon: '🫕',
    stage: 'cook',
    category: 'Heat Application',
    subcategory: 'Liquid Cooking',
    description: 'Cook in boiling water or liquid',
    skillLevel: 'beginner',
    estimatedDuration: 600,
    inputs: [
      { id: 'ingredients', label: 'Ingredients', type: 'RawIngredient', required: true },
      { id: 'pot', label: 'Pot', type: 'Pot', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Boiled Ingredients', type: 'CookedVegetables' },
      { id: 'pot-out', label: 'Pot', type: 'Pot' },
    ],
  },
  {
    id: 'cook-simmer',
    name: 'Simmer',
    icon: '♨️',
    stage: 'cook',
    category: 'Heat Application',
    subcategory: 'Liquid Cooking',
    description: 'Gentle cooking below boiling point',
    skillLevel: 'beginner',
    estimatedDuration: 900,
    inputs: [
      { id: 'ingredients', label: 'Ingredients', type: 'Any', required: true },
      { id: 'pot', label: 'Pot', type: 'Pot', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Simmered Ingredients', type: 'PreparedDish' },
      { id: 'pot-out', label: 'Pot', type: 'Pot' },
    ],
  },
  {
    id: 'cook-bake',
    name: 'Bake',
    icon: '🔥',
    stage: 'cook',
    category: 'Heat Application',
    subcategory: 'Oven',
    description: 'Cook in oven with dry heat',
    skillLevel: 'beginner',
    estimatedDuration: 1800,
    inputs: [
      { id: 'ingredients', label: 'Prepared Dish', type: 'Any', required: true },
      { id: 'vessel', label: 'Baking Sheet', type: 'BakingSheet', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Baked Dish', type: 'PreparedDish' },
    ],
  },
  {
    id: 'cook-grill',
    name: 'Grill',
    icon: '🔥',
    stage: 'cook',
    category: 'Heat Application',
    subcategory: 'Direct Heat',
    description: 'Cook over open flame or grill grates',
    skillLevel: 'intermediate',
    estimatedDuration: 480,
    inputs: [
      { id: 'protein', label: 'Protein', type: 'MarinatedMeat', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Grilled Protein', type: 'CookedProtein' },
    ],
  },

  // === FINISH: Assembly ===
  {
    id: 'finish-combine',
    name: 'Combine Ingredients',
    icon: '🥣',
    stage: 'finish',
    category: 'Assembly',
    subcategory: 'Mixing',
    description: 'Combine multiple prepared components',
    skillLevel: 'beginner',
    estimatedDuration: 120,
    inputs: [
      { id: 'component1', label: 'Component 1', type: 'Any', required: true },
      { id: 'component2', label: 'Component 2', type: 'Any', required: false },
      { id: 'component3', label: 'Component 3', type: 'Any', required: false },
    ],
    outputs: [
      { id: 'result', label: 'Combined Dish', type: 'PreparedDish' },
    ],
  },
  {
    id: 'finish-plate',
    name: 'Plate Dish',
    icon: '🍽️',
    stage: 'finish',
    category: 'Assembly',
    subcategory: 'Presentation',
    description: 'Arrange dish on serving plate',
    skillLevel: 'beginner',
    estimatedDuration: 180,
    inputs: [
      { id: 'dish', label: 'Prepared Dish', type: 'PreparedDish', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Plated Dish', type: 'PlatedDish' },
    ],
  },
  {
    id: 'finish-garnish',
    name: 'Garnish',
    icon: '🌿',
    stage: 'finish',
    category: 'Assembly',
    subcategory: 'Presentation',
    description: 'Add finishing garnishes and herbs',
    skillLevel: 'beginner',
    estimatedDuration: 60,
    inputs: [
      { id: 'dish', label: 'Plated Dish', type: 'PlatedDish', required: true },
      { id: 'garnish', label: 'Garnish', type: 'RawIngredient', required: false },
    ],
    outputs: [
      { id: 'result', label: 'Finished Dish', type: 'PlatedDish' },
    ],
  },
  {
    id: 'finish-sauce',
    name: 'Add Sauce',
    icon: '🥫',
    stage: 'finish',
    category: 'Assembly',
    subcategory: 'Sauce',
    description: 'Drizzle or pool sauce on dish',
    skillLevel: 'beginner',
    estimatedDuration: 30,
    inputs: [
      { id: 'dish', label: 'Dish', type: 'PreparedDish', required: true },
      { id: 'sauce', label: 'Sauce', type: 'Sauce', required: true },
    ],
    outputs: [
      { id: 'result', label: 'Sauced Dish', type: 'PreparedDish' },
    ],
  },

  // === CONTROL: Flow Control ===
  {
    id: 'control-timer',
    name: 'Timer',
    icon: '⏱️',
    stage: 'control',
    category: 'Control Flow',
    subcategory: 'Timing',
    description: 'Wait for specified time duration',
    skillLevel: 'beginner',
    estimatedDuration: 0,
    inputs: [
      { id: 'input', label: 'Input', type: 'Any', required: true },
      { id: 'duration', label: 'Duration', type: 'TimeDuration', required: true, default: 300 },
    ],
    outputs: [
      { id: 'output', label: 'Output', type: 'Any' },
    ],
  },
  {
    id: 'control-rest',
    name: 'Rest / Wait',
    icon: '💤',
    stage: 'control',
    category: 'Control Flow',
    subcategory: 'Timing',
    description: 'Allow dish to rest (e.g., meat resting)',
    skillLevel: 'beginner',
    estimatedDuration: 300,
    inputs: [
      { id: 'input', label: 'Cooked Item', type: 'CookedProtein', required: true },
    ],
    outputs: [
      { id: 'output', label: 'Rested Item', type: 'CookedProtein' },
    ],
  },
  {
    id: 'control-check-doneness',
    name: 'Check Doneness',
    icon: '🌡️',
    stage: 'control',
    category: 'Control Flow',
    subcategory: 'Validation',
    description: 'Verify cooking is complete',
    skillLevel: 'intermediate',
    estimatedDuration: 30,
    inputs: [
      { id: 'input', label: 'Cooking Item', type: 'Any', required: true },
    ],
    outputs: [
      { id: 'done', label: 'Done', type: 'Any', description: 'Item is properly cooked' },
      { id: 'continue', label: 'Continue Cooking', type: 'Any', description: 'Need more time' },
    ],
  },
];

// Group definitions by stage and category
export function getNodesByStage(stage: string): TacticNodeDefinition[] {
  return nodeDefinitions.filter(n => n.stage === stage);
}

export function getNodesByCategory(category: string): TacticNodeDefinition[] {
  return nodeDefinitions.filter(n => n.category === category);
}

export function getNodeCategories(): { stage: string; category: string; nodes: TacticNodeDefinition[] }[] {
  const grouped: Record<string, Record<string, TacticNodeDefinition[]>> = {};
  
  nodeDefinitions.forEach(node => {
    if (!grouped[node.stage]) grouped[node.stage] = {};
    if (!grouped[node.stage][node.category]) grouped[node.stage][node.category] = [];
    grouped[node.stage][node.category].push(node);
  });

  const result: { stage: string; category: string; nodes: TacticNodeDefinition[] }[] = [];
  
  const stageOrder = ['prep', 'cook', 'finish', 'control'];
  stageOrder.forEach(stage => {
    if (grouped[stage]) {
      Object.entries(grouped[stage]).forEach(([category, nodes]) => {
        result.push({ stage, category, nodes });
      });
    }
  });

  return result;
}
