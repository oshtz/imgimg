//! Keyword replacement in prompts using word-boundary matching.

use std::collections::HashMap;

/// Apply keyword replacements to a prompt using whole-word matching.
pub fn apply_keyword_replacements(prompt: &str, replacements: &HashMap<String, String>) -> String {
    let mut result = prompt.to_string();

    for (keyword, description) in replacements {
        // Escape regex special characters in the keyword
        let escaped = regex::escape(keyword);
        // Create word-boundary pattern (case-insensitive)
        let pattern = format!(r"(?i)\b{}\b", escaped);
        if let Ok(re) = regex::Regex::new(&pattern) {
            result = re.replace_all(&result, description.as_str()).to_string();
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyword_replacement() {
        let mut replacements = HashMap::new();
        replacements.insert(
            "bonnie".to_string(),
            "blonde haired woman with green eyes".to_string(),
        );

        let result = apply_keyword_replacements("Bonnie is sitting in a cafe", &replacements);
        assert_eq!(
            result,
            "blonde haired woman with green eyes is sitting in a cafe"
        );
    }

    #[test]
    fn test_no_partial_match() {
        let mut replacements = HashMap::new();
        replacements.insert("cat".to_string(), "feline creature".to_string());

        // "cat" should NOT match inside "concatenation" or "cats" (word boundary)
        let result = apply_keyword_replacements("a concatenation of cats", &replacements);
        assert_eq!(result, "a concatenation of cats");
    }

    #[test]
    fn test_exact_word_match() {
        let mut replacements = HashMap::new();
        replacements.insert("cat".to_string(), "feline creature".to_string());

        let result = apply_keyword_replacements("a cat sat on a mat", &replacements);
        assert_eq!(result, "a feline creature sat on a mat");
    }
}
