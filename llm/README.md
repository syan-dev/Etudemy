YouTube Transcript Question Generator (via Console)
This is a powerful JavaScript script designed to run directly in the browser's Console. It automatically generates a list of questions from the transcript of any YouTube video using the OpenAI API.

Key Features
This script is more than a simple tool; it's equipped with advanced data processing techniques to ensure high-quality output:

OpenAI API Integration: Utilizes the gpt-3.5-turbo model (customizable) to generate intelligent questions.

Context-Aware Chunking: Instead of arbitrarily splitting the text, the script intelligently finds the nearest sentence endings to chunk the transcript. This ensures each segment sent to the AI is semantically complete.

Smart Question Filtering: Automatically removes questions that are semantically similar by creating a keyword-based "signature," rather than just filtering out 100% identical duplicates.

Data Cleaning: Automatically removes excess whitespace, newlines, and redundant characters before sending the text to the API, saving tokens and improving efficiency.

Easy Customization: All critical parameters—such as the API Key, chunk size, AI model, and system prompt—are centralized in a single config object for easy modification.

How to Use
Get started in just 5 simple steps:

Get an API Key: Go to your OpenAI account and create a new API key.

Configure the Script: Open the youtube_console_script.js file and paste your API key into the apiKey variable within the config object.

config: {
    apiKey: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // <-- PASTE YOUR KEY HERE
    // ...
},

Open YouTube: Navigate to a YouTube video (in English) that has a transcript available.

Show Transcript: Below the video player, click the ... button and select "Show transcript". The transcript must be visible on the page.

Run the Script:

Press F12 (or Ctrl+Shift+I / Cmd+Opt+I) to open the Developer Tools.

Switch to the Console tab.

Copy the entire content of the script and paste it into the Console.

Press Enter.

The script will begin execution and log its progress in the Console. Once finished, an alert will pop up, and the final list of questions will be neatly displayed for you to copy.

How the Advanced Features Work
Sentence-based Chunking (chunkBySentences):
This function takes a segment of text approximately the size of chunkSize, then searches backward for the last punctuation mark (., !, ?). This ensures that chunks are not split mid-thought, providing better context for the AI.

Signature-based Filtering (getUniqueQuestionsBySignature):
To identify similar questions, this function performs the following steps for each question:

Converts the text to lowercase and removes punctuation.

Removes common, low-impact English words (stop words) like 'a', 'the', 'is', 'what', etc.

Sorts the remaining keywords alphabetically.

Joins them to create a unique "signature."

Questions that produce the same signature are considered duplicates and are filtered out.

This is a useful tool for studying, research, or quickly summarizing video content.
