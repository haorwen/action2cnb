import OpenAI from 'openai';

// NOTE: Do not commit tokens and keys to version control.
// Use environment variables or other secure methods in production.
const OPENAI_API_KEY = 'sk-cnb-ai-key'; // Replace with your OpenAI API key
const OPENAI_BASE_URL = 'https://action2cnb-ai.haorwen.top/v1'; // Or your proxy address

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
  baseURL: OPENAI_BASE_URL
});

/**
 * Optimizes the CNB workflow using AI.
 * @param {string} originalWorkflow - The original GitHub Actions workflow YAML.
 * @param {string} convertedWorkflow - The converted CNB workflow YAML.
 * @returns {Promise<string>} - The optimized CNB workflow as a string.
 */
export async function optimizeWithAI(originalWorkflow, convertedWorkflow) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key') {
    throw new Error('OpenAI API key is not configured. Please set it in src/ai-optimizer.js');
  }

  try {
    // Fetch knowledge base files from the public folder
    const grammarResponse = await fetch('/grammar.md');
    const grammarText = await grammarResponse.text();

    const migrateResponse = await fetch('/migrate-from-github-actions.md');
    const migrateText = await migrateResponse.text();

    const systemPrompt = `CNB is a platform like GitHub Actions, but the workflow file format is different. You are an expert in CNB and GitHub Actions workflows. Your task is to optimize a converted CNB workflow based on the original GitHub workflow, the initial conversion, and best practices from the knowledge base. The output should be only the YAML code block, without any extra explanations.

Here is the knowledge base for your reference:

### CNB Workflow Grammar
${grammarText}

### Migration Guide from GitHub Actions
${migrateText}
`;

    // 3. Call OpenAI to generate the optimized workflow
    const stream = await openai.chat.completions.create({
      model: "claude-4-sonnet", // Or any other suitable model
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `请根据上面信息，优化转换后的 CNB 工作流。

### 原始 GitHub Actions 工作流:
\`\`\`yaml
${originalWorkflow}
\`\`\`

### 转换后的 CNB 工作流:
\`\`\`yaml
${convertedWorkflow}
\`\`\`

请优化“转换后的 CNB 工作流”，使其更简洁、高效，并符合最佳实践。返回优化后的完整 YAML 内容，并仅使用代码块包裹。注意语法上的差异，比如你不能使用github上的任何插件`,
        },
      ],
      temperature: 0.2, // Lower temperature for more deterministic output
      stream: true,
    });

    return stream;

  } catch (error) {
    console.error("Error during AI optimization:", error);
    throw new Error(`AI optimization failed: ${error.message}`);
  }
}