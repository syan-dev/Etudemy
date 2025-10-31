# ✨ YouTube Transcript Question Generator ✨

A powerful JavaScript script designed to run directly in the browser's Console. It automatically generates a list of questions from the transcript of any YouTube video using the OpenAI API.

---

## 🌟 Key Features

This script is more than a simple tool; it's equipped with advanced data processing techniques to ensure high-quality output:

- **🤖 OpenAI API Integration**: Utilizes the `gpt-3.5-turbo` model (customizable) to generate intelligent questions.
- **🧠 Context-Aware Chunking**: Intelligently finds the nearest sentence endings to chunk the transcript, ensuring each segment sent to the AI is semantically complete.
- **🎯 Smart Question Filtering**: Automatically removes semantically similar questions by creating a keyword-based "signature," rather than just filtering out 100% identical duplicates.
- **🧼 Data Cleaning**: Automatically removes excess whitespace and newlines before sending the text to the API, saving tokens and improving efficiency.
- **🔧 Easy Customization**: All critical parameters—API Key, chunk size, AI model, and system prompt—are centralized in a single `config` object for easy modification.

## 🚀 How to Use

Get started in just 5 simple steps:

1.  **Get an API Key**
    Go to your [OpenAI account](https://platform.openai.com/account/api-keys) and create a new API key.

2.  **Configure the Script**
    Open the `youtube_console_script.js` file and paste your API key into the `apiKey` variable.

    > **Note:** This is the only line you need to edit.
    > ```javascript
    > config: {
    >     apiKey: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // <-- PASTE YOUR KEY HERE
    >     // ...
    > },
    > ```

3.  **Open YouTube**
    Navigate to a YouTube video (in English) that has a transcript available.

4.  **Show Transcript**
    Below the video player, click the `...` button and select **"Show transcript"**. The transcript must be visible on the page for the script to work.

5.  **Run the Script**
    - Press `F12` (or `Ctrl+Shift+I` / `Cmd+Opt+I`) to open Developer Tools.
    - Switch to the **Console** tab.
    - Copy the entire content of the script and paste it into the Console.
    - Press `Enter`.

The script will begin execution, and the final list of questions will be neatly displayed in the Console for you to copy.

## 💡 How the Advanced Features Work

### Sentence-based Chunking (`chunkBySentences`)

This function takes a segment of text approximately the size of `chunkSize`, then searches backward for the last punctuation mark (`.`, `!`, `?`). This ensures that chunks are not split mid-thought, providing better context for the AI.

### Signature-based Filtering (`getUniqueQuestionsBySignature`)

To identify and remove semantically similar questions, this function performs the following steps for each question:

1.  Converts the text to lowercase and removes punctuation.
2.  Removes common, low-impact English words (stop words) like 'a', 'the', 'is', 'what', etc.
3.  Sorts the remaining keywords alphabetically.
4.  Joins them to create a unique "signature."

Questions that produce the same signature are considered duplicates and are filtered out, ensuring a diverse and meaningful set of questions.

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for improvements or find a bug, feel free to open an issue or submit a pull request.

## 📝 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
