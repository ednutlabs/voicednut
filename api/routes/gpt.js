require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const PersonalityEngine = require('../functions/PersonalityEngine');

class EnhancedGptService extends EventEmitter {
  constructor(customPrompt = null, customFirstMessage = null) {
    super();
    
    // Initialize OpenRouter client
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": process.env.YOUR_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.YOUR_SITE_NAME || "Adaptive Voice AI",
      }
    });
    
    this.model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
    
    // Initialize Personality Engine
    this.personalityEngine = new PersonalityEngine();
    
    // Dynamic function system
    this.dynamicTools = [];
    this.availableFunctions = {};
    
    const defaultPrompt = 'You are an intelligent AI assistant capable of adapting to different business contexts and customer needs. Be professional, helpful, and responsive to customer communication styles. You must add a \'•\' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.';
    const defaultFirstMessage = 'Hello! How can I assist you today?';

    // Use custom prompt if provided, otherwise use default
    this.baseSystemPrompt = customPrompt || defaultPrompt;
    const firstMessage = customFirstMessage || defaultFirstMessage;

    // Initialize conversation with adaptive prompt
    this.userContext = [
      { 'role': 'system', 'content': this.baseSystemPrompt },
      { 'role': 'assistant', 'content': firstMessage },
    ];
    
    this.partialResponseIndex = 0;
    this.conversationHistory = []; // Track full conversation for personality analysis

    // Store prompts for debugging/logging
    this.systemPrompt = this.baseSystemPrompt;
    this.firstMessage = firstMessage;
    this.isCustomConfiguration = !!(customPrompt || customFirstMessage);

    // Personality tracking
    this.personalityChanges = [];
    this.lastPersonalityUpdate = null;

    console.log('🎭 Enhanced GPT Service initialized with adaptive capabilities'.green);
    if (this.isCustomConfiguration) {
      console.log(`Custom prompt preview: ${this.baseSystemPrompt.substring(0, 100)}...`.cyan);
    }
  }

  // Set dynamic functions for this conversation
  setDynamicFunctions(tools, implementations) {
    this.dynamicTools = tools;
    this.availableFunctions = implementations;
    
    console.log(`🔧 Loaded ${tools.length} dynamic functions: ${Object.keys(implementations).join(', ')}`.blue);
  }

  // Add the callSid to the chat context
  setCallSid(callSid) {
    this.callSid = callSid;
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  // Get current personality and adaptation info
  getPersonalityInfo() {
    const personality = this.personalityEngine.getCurrentPersonality();
    const report = this.personalityEngine.getAdaptationReport();
    
    return {
      ...personality,
      adaptationReport: report,
      personalityChanges: this.personalityChanges
    };
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Double function arguments returned by OpenAI:', args);
      if (args.indexOf('{') != args.lastIndexOf('{')) {
        return JSON.parse(args.substring(args.indexOf(''), args.indexOf('}') + 1));
      }
    }
  }

  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ 'role': role, 'name': name, 'content': text });
    } else {
      this.userContext.push({ 'role': role, 'content': text });
    }
  }

  // Enhanced completion method with dynamic functions and personality adaptation
  async completion(text, interactionCount, role = 'user', name = 'user') {
    // Store conversation for personality analysis
    this.conversationHistory.push({
      role: role,
      content: text,
      timestamp: new Date().toISOString(),
      interactionCount: interactionCount
    });

    // Analyze customer message and adapt personality if needed
    if (role === 'user') {
      console.log(`🔍 Analyzing message for adaptation...`.blue);
      
      const adaptation = this.personalityEngine.adaptPersonality(text, this.conversationHistory);
      
      if (adaptation.personalityChanged) {
        console.log(`🎭 Personality: ${adaptation.previousPersonality} → ${adaptation.currentPersonality}`.magenta);
        
        // Update system prompt with new personality
        this.updateSystemPromptWithPersonality(adaptation.adaptedPrompt);
        
        // Log personality change
        this.personalityChanges.push({
          from: adaptation.previousPersonality,
          to: adaptation.currentPersonality,
          trigger: adaptation.analysis,
          timestamp: new Date().toISOString(),
          interactionCount: interactionCount
        });

        this.lastPersonalityUpdate = adaptation;
        
        // Emit personality change event
        this.emit('personalityChanged', {
          from: adaptation.previousPersonality,
          to: adaptation.currentPersonality,
          reason: adaptation.analysis,
          adaptedPrompt: adaptation.adaptedPrompt
        });
      }

      console.log(`🎯 Current: ${adaptation.currentPersonality} | Mood: ${adaptation.context.customerMood}`.cyan);
    }

    this.updateUserContext(name, role, text);

    // Use dynamic tools if available, otherwise use default empty array
    const toolsToUse = this.dynamicTools.length > 0 ? this.dynamicTools : [];

    // Send completion request with current personality-adapted context and dynamic tools
    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: this.userContext,
      tools: toolsToUse,
      stream: true,
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || '';
      if (name != '') {
        functionName = name;
      }
      let args = deltas.tool_calls[0]?.function?.arguments || '';
      if (args != '') {
        functionArgs += args;
      }
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) {
        collectToolInformation(deltas);
      }

      if (finishReason === 'tool_calls') {
        // Use dynamic function if available
        const functionToCall = this.availableFunctions[functionName];
        
        if (!functionToCall) {
          console.error(`❌ Function ${functionName} not found in dynamic implementations`.red);
          // Continue without function call
          completeResponse += `I apologize, but I cannot execute the ${functionName} function at this time.`;
          continue;
        }

        const validatedArgs = this.validateFunctionArgs(functionArgs);
        
        // Find the corresponding tool data for the "say" message
        const toolData = this.dynamicTools.find(tool => tool.function.name === functionName);
        const say = toolData?.function?.say || 'One moment please...';

        // Emit the function call response with personality context
        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say,
          personalityInfo: this.personalityEngine.getCurrentPersonality()
        }, interactionCount);

        let functionResponse;
        try {
          functionResponse = await functionToCall(validatedArgs);
          console.log(`🔧 Executed dynamic function: ${functionName}`.green);
        } catch (functionError) {
          console.error(`❌ Error executing function ${functionName}:`, functionError);
          functionResponse = JSON.stringify({ error: 'Function execution failed', details: functionError.message });
        }

        this.updateUserContext(functionName, 'function', functionResponse);
        
        // Continue completion with function response
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        completeResponse += content;
        partialResponse += content;
        
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const gptReply = { 
            partialResponseIndex: this.partialResponseIndex,
            partialResponse,
            personalityInfo: this.personalityEngine.getCurrentPersonality(),
            adaptationHistory: this.personalityChanges.slice(-3), // Last 3 changes
            functionsAvailable: Object.keys(this.availableFunctions).length
          };

          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }
    }

    // Store AI response in conversation history
    this.conversationHistory.push({
      role: 'assistant',
      content: completeResponse,
      timestamp: new Date().toISOString(),
      interactionCount: interactionCount,
      personality: this.personalityEngine.currentPersonality,
      functionsUsed: functionName ? [functionName] : []
    });

    this.userContext.push({'role': 'assistant', 'content': completeResponse});
    
    console.log(`🧠 Context: ${this.userContext.length} | Personality: ${this.personalityEngine.currentPersonality} | Functions: ${Object.keys(this.availableFunctions).length}`.green);
  }

  // Update system prompt with new personality
  updateSystemPromptWithPersonality(adaptedPrompt) {
    // Replace the first system message with the adapted prompt
    const systemMessageIndex = this.userContext.findIndex(msg => msg.role === 'system' && msg.content !== `callSid: ${this.callSid}`);
    
    if (systemMessageIndex !== -1) {
      this.userContext[systemMessageIndex].content = adaptedPrompt;
      console.log(`📝 System prompt updated for new personality`.green);
    } else {
      // If no system message found, add one at the beginning
      this.userContext.unshift({ 'role': 'system', 'content': adaptedPrompt });
    }
  }

  // Get comprehensive conversation analysis
  getConversationAnalysis() {
    const personalityReport = this.personalityEngine.getAdaptationReport();
    
    return {
      totalInteractions: this.conversationHistory.length,
      personalityChanges: this.personalityChanges.length,
      currentPersonality: this.personalityEngine.currentPersonality,
      personalityHistory: this.personalityChanges,
      conversationFlow: this.conversationHistory.slice(-10), // Last 10 messages
      adaptationReport: personalityReport,
      contextLength: this.userContext.length,
      functionsAvailable: Object.keys(this.availableFunctions).length,
      dynamicTools: this.dynamicTools.map(tool => tool.function.name)
    };
  }

  // Method to force personality switch (for testing or manual override)
  forcePersonalitySwitch(personalityName, reason = 'manual_override') {
    if (this.personalityEngine.personalities[personalityName]) {
      const oldPersonality = this.personalityEngine.currentPersonality;
      this.personalityEngine.currentPersonality = personalityName;
      
      const adaptedPrompt = this.personalityEngine.generateAdaptedPrompt();
      this.updateSystemPromptWithPersonality(adaptedPrompt);
      
      this.personalityChanges.push({
        from: oldPersonality,
        to: personalityName,
        trigger: { reason: reason },
        timestamp: new Date().toISOString(),
        manual: true
      });

      console.log(`🎭 Manually switched personality: ${oldPersonality} → ${personalityName}`.yellow);
      
      return {
        success: true,
        from: oldPersonality,
        to: personalityName,
        adaptedPrompt: adaptedPrompt
      };
    } else {
      console.log(`❌ Unknown personality: ${personalityName}`.red);
      return { success: false, error: 'Unknown personality' };
    }
  }

  // Add new dynamic function at runtime
  addDynamicFunction(toolDefinition, implementation) {
    this.dynamicTools.push(toolDefinition);
    this.availableFunctions[toolDefinition.function.name] = implementation;
    
    console.log(`🔧 Added dynamic function: ${toolDefinition.function.name}`.green);
  }

  // Remove dynamic function
  removeDynamicFunction(functionName) {
    this.dynamicTools = this.dynamicTools.filter(tool => tool.function.name !== functionName);
    delete this.availableFunctions[functionName];
    
    console.log(`🔧 Removed dynamic function: ${functionName}`.yellow);
  }

  // Get function usage statistics
  getFunctionUsageStats() {
    const functionCalls = {};
    let totalFunctionCalls = 0;

    this.conversationHistory.forEach(msg => {
      if (msg.functionsUsed && msg.functionsUsed.length > 0) {
        msg.functionsUsed.forEach(funcName => {
          functionCalls[funcName] = (functionCalls[funcName] || 0) + 1;
          totalFunctionCalls++;
        });
      }
    });

    return {
      totalCalls: totalFunctionCalls,
      functionBreakdown: functionCalls,
      availableFunctions: Object.keys(this.availableFunctions),
      utilizationRate: this.conversationHistory.length > 0 ? 
        (totalFunctionCalls / this.conversationHistory.length * 100).toFixed(1) : 0
    };
  }

  // Reset for new conversation
  reset() {
    this.personalityEngine.reset();
    this.conversationHistory = [];
    this.personalityChanges = [];
    this.partialResponseIndex = 0;
    
    // Reset user context but keep the base system prompt and first message
    this.userContext = [
      { 'role': 'system', 'content': this.baseSystemPrompt },
      { 'role': 'assistant', 'content': this.firstMessage },
    ];
    
    if (this.callSid) {
      this.userContext.push({ 'role': 'system', 'content': `callSid: ${this.callSid}` });
    }

    console.log('🔄 Enhanced GPT Service reset for new conversation'.blue);
  }

  // Get current configuration with comprehensive info
  getConfiguration() {
    const functionStats = this.getFunctionUsageStats();
    
    return {
      isCustomConfiguration: this.isCustomConfiguration,
      systemPrompt: this.systemPrompt,
      firstMessage: this.firstMessage,
      contextLength: this.userContext.length,
      personalityEngine: this.getPersonalityInfo(),
      conversationAnalysis: this.getConversationAnalysis(),
      functionSystem: {
        dynamicFunctions: this.dynamicTools.length,
        availableFunctions: Object.keys(this.availableFunctions),
        usageStats: functionStats
      }
    };
  }

  // Test dynamic function (for debugging)
  async testDynamicFunction(functionName, args) {
    if (!this.availableFunctions[functionName]) {
      return { success: false, error: `Function ${functionName} not found` };
    }

    try {
      const result = await this.availableFunctions[functionName](args);
      console.log(`🧪 Test result for ${functionName}:`, result);
      return { success: true, result: result };
    } catch (error) {
      console.error(`❌ Test failed for ${functionName}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Get adaptation effectiveness score
  getAdaptationEffectiveness() {
    if (this.conversationHistory.length === 0) return 0;

    const userInteractions = this.conversationHistory.filter(msg => msg.role === 'user').length;
    const adaptations = this.personalityChanges.length;
    
    // Base effectiveness on adaptation frequency relative to conversation length
    const adaptationRate = userInteractions > 0 ? adaptations / userInteractions : 0;
    
    // Optimal range is 0.1-0.3 adaptations per user message
    let effectiveness;
    if (adaptationRate < 0.05) {
      effectiveness = 'under_adaptive'; // Too few adaptations
    } else if (adaptationRate > 0.5) {
      effectiveness = 'over_adaptive'; // Too many adaptations
    } else {
      effectiveness = 'well_adaptive'; // Good balance
    }
    
    return {
      score: Math.min(100, adaptationRate * 300), // Scale to 0-100
      rating: effectiveness,
      adaptations: adaptations,
      userInteractions: userInteractions,
      rate: (adaptationRate * 100).toFixed(1) + '%'
    };
  }

  // Export conversation data for analysis
  exportConversationData() {
    return {
      metadata: {
        callSid: this.callSid,
        startTime: this.conversationHistory[0]?.timestamp,
        endTime: this.conversationHistory[this.conversationHistory.length - 1]?.timestamp,
        totalInteractions: this.conversationHistory.length,
        isCustomConfiguration: this.isCustomConfiguration
      },
      conversationFlow: this.conversationHistory,
      personalityAdaptations: this.personalityChanges,
      functionUsage: this.getFunctionUsageStats(),
      adaptationEffectiveness: this.getAdaptationEffectiveness(),
      finalState: {
        personality: this.personalityEngine.currentPersonality,
        contextLength: this.userContext.length,
        availableFunctions: Object.keys(this.availableFunctions)
      }
    };
  }
}

module.exports = { EnhancedGptService };