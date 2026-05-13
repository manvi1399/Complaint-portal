package com.municipality.complaint.controller;

import com.municipality.complaint.service.ComplaintService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * REST controller for complaint classification.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ComplaintController {

    private final ComplaintService complaintService;

    public ComplaintController(ComplaintService complaintService) {
        this.complaintService = complaintService;
    }

    @PostMapping("/predict")
    public Map<String, String> predictCategory(@RequestBody Map<String, String> payload) {
        String complaintText = payload.getOrDefault("complaint", "");
        Map<String, String> prediction = complaintService.classifyComplaint(complaintText);

        Map<String, String> response = new HashMap<>();
        response.put("category", prediction.getOrDefault("category", "Other"));
        response.put("severity", prediction.getOrDefault("severity", "Low"));
        response.put("status", "success");
        return response;
    }
}
