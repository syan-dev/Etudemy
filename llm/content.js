const YouTubeQuestionGenerator = {
    // PART 1: CONFIGURATION
    config: {
        apiKey: "sk-xxxxxxxxxx",
        transcriptSelector: 'ytd-transcript-segment-renderer .segment-text',
        chunkSize: 2500,
        openAI: {
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            systemPrompt: "Bạn là một trợ lý hữu ích chuyên tạo câu hỏi dựa trên văn bản được cung cấp. Vui lòng tạo 5-7 câu hỏi ngắn gọn. Trả về kết quả dưới dạng một mảng JSON hợp lệ chứa các chuỗi. Ví dụ: [\"Câu hỏi 1?\", \"Câu hỏi 2?\"]"
        }
    },

    // PART 2: UI
    ui: {
        extractTranscript: function() {
            const selector = YouTubeQuestionGenerator.config.transcriptSelector;
            const segments = document.querySelectorAll(selector);
            if (segments.length === 0) {
                console.error("Không tìm thấy các đoạn ghi. Vui lòng đảm bảo bảng ghi đang được hiển thị.");
                return null;
            }
            return [...segments].map(segment => segment.textContent.trim()).join(' ');
        },
        displayResults: function(questions) {
            console.log(`\n======================================`);
            console.log(`CÁC CÂU HỎI ĐỘC NHẤT ĐÃ ĐƯỢC TẠO (${questions.length}):`);
            console.log(`======================================`);
            questions.forEach((q, index) => {
                console.log(`${index + 1}. ${q}`);
            });
            console.log("\n(Sao chép khối văn bản bên dưới để sử dụng)");
            console.log(questions.join('\n'));
            alert(`Hoàn tất! Đã tạo ${questions.length} câu hỏi độc nhất. Hãy kiểm tra Console (F12) để xem chi tiết.`);
        },
        showAlert: function(message, isError = false) {
            isError ? console.error(message) : console.log(message);
            alert(message);
        }
    },

    // PART 3: API 
    api: {
        callOpenAI: async function(textChunk) {
            console.log("Đang gửi chunk đã làm sạch đến OpenAI API:", textChunk.substring(0, 100) + "...");
            const { apiKey, openAI } = YouTubeQuestionGenerator.config;
            const { apiUrl, model, systemPrompt } = openAI;
            const userPrompt = `Dựa trên đoạn văn bản sau, hãy tạo một danh sách câu hỏi:\n\n---\n${textChunk}\n---`;
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.5,
                    })
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Lỗi OpenAI API: ${response.status} - ${errorData.error.message}`);
                }
                const data = await response.json();
                const content = data.choices[0].message.content;
                try {
                    const questions = JSON.parse(content);
                    return Array.isArray(questions) ? questions : [];
                } catch (parseError) {
                    console.error("Lỗi phân tích JSON từ OpenAI:", content, parseError);
                    return [];
                }
            } catch (error) {
                console.error("Lỗi khi gọi OpenAI API:", error);
                throw error;
            }
        }
    },

    // PART 4: DATA PROCESSING LOGIC - CHUNKING - CLEANING - FILTERING(BASIC) 
    logic: {
        chunkBySentences: function(text, maxSize) {
            const chunks = [];
            let remainingText = text;

            while (remainingText.length > 0) {
                if (remainingText.length <= maxSize) {
                    chunks.push(remainingText);
                    break;
                }

                let chunk = remainingText.substring(0, maxSize);
                let lastSentenceEnd = -1;

                // Tìm vị trí kết thúc câu cuối cùng trong chunk
                ['.', '!', '?', '\n'].forEach(punc => {
                    const pos = chunk.lastIndexOf(punc);
                    if (pos > lastSentenceEnd) {
                        lastSentenceEnd = pos;
                    }
                });

                // Nếu tìm thấy điểm cuối câu, cắt tại đó. Nếu không, cắt tại maxSize.
                const splitIndex = lastSentenceEnd > -1 ? lastSentenceEnd + 1 : maxSize;
                chunks.push(remainingText.substring(0, splitIndex));
                remainingText = remainingText.substring(splitIndex);
            }
            return chunks;
        },


        cleanText: function(text) {
            // Xóa khoảng trắng ở 2 đầu, thay thế nhiều khoảng trắng/xuống dòng bằng một dấu cách duy nhất.
            return text.trim().replace(/\s+/g, ' ');
        },

        getUniqueQuestionsBySignature: function(questions) {
            // List of common English stop words to filter out
            const englishStopWords = new Set([
                'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'i', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'what', 'when', 'where', 'who', 'why', 'how', 'you', 'your', 'they', 'we', 'me', 'my', 'is', 'are'
            ]);

            const createSignature = (text) => {
                return text
                    .toLowerCase() // Convert to lower case
                    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "") // Remove punctuation
                    .split(/\s+/) // Split into words
                    .filter(word => !englishStopWords.has(word) && word.length > 1) // Filter out stop words
                    .sort() // Sort keywords alphabetically
                    .join(' '); // Join back into a "signature"
            };

            const seenSignatures = new Set();
            const uniqueQuestions = [];

            for (const q of questions) {
                const signature = createSignature(q);
                if (signature && !seenSignatures.has(signature)) {
                    seenSignatures.add(signature);
                    uniqueQuestions.push(q);
                }
            }
            return uniqueQuestions;
        }
    },

    // PART 5: MAIN THREAD
    run: async function() {
        if (this.config.apiKey.startsWith("sk-xxx")) {
            this.ui.showAlert("LỖI: Vui lòng dán OpenAI API Key của bạn vào 'config.apiKey'.", true);
            return;
        }

        this.ui.showAlert("Bắt đầu quá trình nâng cao...");

        const transcript = this.ui.extractTranscript();
        if (!transcript) {
            this.ui.showAlert("LỖI: Không tìm thấy bản ghi.", true);
            return;
        }
        console.log(`Đã trích xuất bản ghi (${transcript.length} ký tự).`);

        let chunks = this.logic.chunkBySentences(transcript, this.config.chunkSize);
        console.log(`Đã chia bản ghi thành ${chunks.length} chunk thông minh.`);

        chunks = chunks.map(chunk => this.logic.cleanText(chunk));

        try {
            const allQuestionsArrays = await Promise.all(
                chunks.map(chunk => this.api.callOpenAI(chunk))
            );

            const mergedQuestions = [].concat(...allQuestionsArrays);
            console.log(`Đã tạo tổng cộng ${mergedQuestions.length} câu hỏi (trước khi lọc).`);

            const uniqueQuestions = this.logic.getUniqueQuestionsBySignature(mergedQuestions);

            if (uniqueQuestions.length > 0) {
                this.ui.displayResults(uniqueQuestions);
            } else {
                this.ui.showAlert("Không thể tạo câu hỏi từ bản ghi này.", true);
            }
        } catch (error) {
            this.ui.showAlert(`Đã xảy ra lỗi nghiêm trọng: ${error.message}.`, true);
        }
    }
};

YouTubeQuestionGenerator.run();

