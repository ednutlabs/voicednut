'use strict';
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.TOGETHER_API_KEY;

async function togetherAIResponse(userInput, systemPrompt = null) {
    try {
        if (!userInput?.trim()) {
            throw new Error('Empty user input');
        }

        const messages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userInput }]
            : [{ role: 'user', content: userInput }];

        const response = await axios({
            method: 'POST',
            url: 'https://api.together.xyz/v1/chat/completions',
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            data: {
                model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
                messages,
                temperature: 0.7,
                max_tokens: 500
            }
        });

        return response.data.choices?.[0]?.message?.content || 
               'I apologize, but I am unable to respond at the moment.';
    } catch (error) {
        console.error('TogetherAI error:', error.response?.data || error.message);
        return 'I apologize, but I encountered an error. Please try again.';
    }
}

module.exports = { togetherAIResponse };