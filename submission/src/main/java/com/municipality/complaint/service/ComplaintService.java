package com.municipality.complaint.service;

import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Service for Municipal Complaint Portal.
 * Integrates with the Python ML model and falls back to simple rules when needed.
 */
@Service
public class ComplaintService {

    private static final String DEFAULT_CATEGORY = "Other";
    private static final String DEFAULT_SEVERITY = "Low";
    private static final String MEDIUM_SEVERITY = "Medium";
    private static final long PYTHON_TIMEOUT_SECONDS = 10;

    public Map<String, String> classifyComplaint(String text) {
        Map<String, String> result = new HashMap<>();

        if (text == null || text.trim().isEmpty()) {
            result.put("category", DEFAULT_CATEGORY);
            result.put("severity", DEFAULT_SEVERITY);
            return result;
        }

        String normalizedText = text.trim();
        String pythonOutput = callPythonModel(normalizedText);

        if (pythonOutput != null && !pythonOutput.isBlank() && !pythonOutput.startsWith("Error:")) {
            String[] parts = pythonOutput.split(",", 2);
            result.put("category", parts[0].trim());
            result.put("severity", parts.length >= 2 ? parts[1].trim() : inferSeverity(normalizedText));
            return result;
        }

        result.put("category", simulateClassification(normalizedText));
        result.put("severity", inferSeverity(normalizedText));
        return result;
    }

    private String simulateClassification(String text) {
        String normalized = text.toLowerCase(Locale.ROOT);

        if (normalized.contains("garbage") || normalized.contains("kachra") || normalized.contains("clean")) {
            return "Garbage";
        } else if (normalized.contains("water") || normalized.contains("pani") || normalized.contains("leak")) {
            return "Water Supply";
        } else if (normalized.contains("road") || normalized.contains("sadak") || normalized.contains("pothole")) {
            return "Road Issues";
        } else if (normalized.contains("sewage") || normalized.contains("gutter") || normalized.contains("drain")) {
            return "Sewage";
        } else if (normalized.contains("light") || normalized.contains("andhera")) {
            return "Street Light";
        }

        return DEFAULT_CATEGORY;
    }

    private String inferSeverity(String text) {
        String normalized = text.toLowerCase(Locale.ROOT);

        if (normalized.contains("danger")
                || normalized.contains("accident")
                || normalized.contains("burst")
                || normalized.contains("flood")
                || normalized.contains("open manhole")) {
            return "High";
        }

        if (normalized.contains("urgent")
                || normalized.contains("blocked")
                || normalized.contains("overflow")
                || normalized.contains("broken")
                || normalized.contains("not working")) {
            return MEDIUM_SEVERITY;
        }

        return DEFAULT_SEVERITY;
    }

    private String callPythonModel(String text) {
        for (List<String> command : buildPythonCommands(text)) {
            try {
                ProcessBuilder processBuilder = new ProcessBuilder(command);
                processBuilder.directory(resolvePythonWorkingDirectory());
                processBuilder.redirectErrorStream(true);

                Process process = processBuilder.start();

                StringBuilder output = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (!output.isEmpty()) {
                            output.append(System.lineSeparator());
                        }
                        output.append(line);
                    }
                }

                boolean finished = process.waitFor(PYTHON_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                if (!finished) {
                    process.destroyForcibly();
                    continue;
                }

                if (process.exitValue() == 0) {
                    return output.toString().trim();
                }

                System.err.println("Python command failed: " + String.join(" ", command));
                System.err.println("Output: " + output);
            } catch (Exception exception) {
                System.err.println("Exception while calling Python model with command "
                        + command + ": " + exception.getMessage());
            }
        }

        return "Error: Prediction Failed";
    }

    private List<List<String>> buildPythonCommands(String text) {
        return List.of(
                List.of("py", "predict.py", text),
                List.of("python", "predict.py", text),
                List.of("python3", "predict.py", text)
        );
    }

    private File resolvePythonWorkingDirectory() {
        File currentDirectory = new File(".");
        File localPredictScript = new File(currentDirectory, "predict.py");
        if (localPredictScript.exists()) {
            return currentDirectory;
        }

        File submissionDirectory = new File(currentDirectory, "submission");
        File nestedPredictScript = new File(submissionDirectory, "predict.py");
        if (nestedPredictScript.exists()) {
            return submissionDirectory;
        }

        return currentDirectory;
    }
}
