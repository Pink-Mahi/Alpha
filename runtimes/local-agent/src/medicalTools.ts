/**
 * Medical tools — symptom assessment, drug database, anatomy,
 * medical conditions, lab interpretation, and clinical decision support.
 *
 * IMPORTANT: These tools are for educational and informational purposes only.
 * They are NOT a substitute for professional medical advice, diagnosis, or treatment.
 * Always include a medical disclaimer when providing health-related information.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// SYMPTOM DATABASE — comprehensive symptom-to-condition mapping
// =============================================================================

interface SymptomInfo {
  name: string;
  description: string;
  possibleCauses: Array<{
    condition: string;
    likelihood: "high" | "medium" | "low";
    notes: string;
  }>;
  redFlags: string[];
  bodySystem: string;
  severity: "mild" | "moderate" | "severe" | "emergency";
}

const SYMPTOMS: Record<string, SymptomInfo> = {
  "chest_pain": {
    name: "Chest Pain",
    description: "Pain, pressure, tightness, or discomfort in the chest area. Can range from sharp to dull, and may radiate to the arm, jaw, or back.",
    bodySystem: "Cardiovascular",
    severity: "emergency",
    possibleCauses: [
      { condition: "Myocardial Infarction (Heart Attack)", likelihood: "high", notes: "Crushing chest pressure, radiating to left arm/jaw, shortness of breath, sweating, nausea. Call 911 immediately." },
      { condition: "Angina", likelihood: "high", notes: "Chest pressure with exertion, relieved by rest. May indicate coronary artery disease." },
      { condition: "Pericarditis", likelihood: "medium", notes: "Sharp chest pain worsened by breathing, relieved by sitting forward. Inflammation of heart sac." },
      { condition: "Aortic Dissection", likelihood: "medium", notes: "Tearing chest pain radiating to back. Life-threatening emergency." },
      { condition: "Gastroesophageal Reflux Disease (GERD)", likelihood: "medium", notes: "Burning chest pain after eating, worse when lying down. Related to stomach acid." },
      { condition: "Costochondritis", likelihood: "low", notes: "Chest wall pain, tender to touch, worsens with movement. Inflammation of rib cartilage." },
      { condition: "Pulmonary Embolism", likelihood: "medium", notes: "Sharp chest pain with sudden shortness of breath. May have leg swelling. Emergency." },
      { condition: "Pneumonia", likelihood: "low", notes: "Chest pain with cough, fever, productive sputum." },
      { condition: "Anxiety/Panic Attack", likelihood: "low", notes: "Chest tightness, racing heart, sweating, fear. Can mimic heart attack." },
    ],
    redFlags: [
      "Crushing/pressure chest pain lasting more than a few minutes",
      "Pain radiating to left arm, jaw, or back",
      "Shortness of breath",
      "Cold sweats, nausea, or vomiting",
      "Pain that worsens with exertion",
      "History of heart disease, diabetes, or smoking",
      "Sudden tearing chest pain radiating to back",
    ],
  },
  "headache": {
    name: "Headache",
    description: "Pain in the head, scalp, or neck. Can be throbbing, sharp, dull, or pressure-like. May be localized or generalized.",
    bodySystem: "Neurological",
    severity: "moderate",
    possibleCauses: [
      { condition: "Tension Headache", likelihood: "high", notes: "Most common type. Bilateral, dull, band-like pressure. Related to stress, poor posture, eye strain." },
      { condition: "Migraine", likelihood: "high", notes: "Throbbing, unilateral, with nausea, sensitivity to light/sound. May have aura (visual disturbances). Lasts 4-72 hours." },
      { condition: "Cluster Headache", likelihood: "medium", notes: "Severe unilateral pain around eye, with tearing, nasal congestion. Occurs in clusters over weeks." },
      { condition: "Sinus Headache", likelihood: "medium", notes: "Pressure behind forehead/cheeks, worsened by bending forward. Often with nasal congestion." },
      { condition: "Dehydration Headache", likelihood: "medium", notes: "Generalized headache, worse with movement. Resolves with hydration." },
      { condition: "Caffeine Withdrawal", likelihood: "low", notes: "Throbbing headache 12-24 hours after stopping caffeine. Resolves in a few days." },
      { condition: "Hypertension", likelihood: "low", notes: "Morning headache, dizziness, blurred vision. Check blood pressure." },
      { condition: "Meningitis", likelihood: "low", notes: "Severe headache with fever, stiff neck, sensitivity to light. Emergency." },
      { condition: "Subarachnoid Hemorrhage", likelihood: "low", notes: "Sudden 'thunderclap' headache — worst headache of life. Emergency." },
      { condition: "Temporal Arteritis", likelihood: "low", notes: "Temporal headache in older adults, jaw pain, vision changes. Risk of blindness. Emergency." },
      { condition: "Medication Overuse Headache", likelihood: "low", notes: "Headache from frequent use of pain medications (>15 days/month)." },
    ],
    redFlags: [
      "Sudden severe 'thunderclap' headache (worst headache of life)",
      "Headache with fever and stiff neck",
      "Headache after head injury",
      "Progressively worsening headache over days/weeks",
      "Headache with neurological symptoms (weakness, numbness, vision loss)",
      "New headache in person over 50",
      "Headache that wakes you from sleep",
      "Headache with confusion or personality changes",
    ],
  },
  "abdominal_pain": {
    name: "Abdominal Pain",
    description: "Pain or discomfort in the abdomen. Can be crampy, sharp, dull, or burning. Location and character help determine cause.",
    bodySystem: "Gastrointestinal",
    severity: "moderate",
    possibleCauses: [
      { condition: "Appendicitis", likelihood: "medium", notes: "Right lower quadrant pain, starting around navel. Nausea, fever. May need surgery. Emergency if severe." },
      { condition: "Gastroenteritis (Stomach Flu)", likelihood: "high", notes: "Crampy abdominal pain with nausea, vomiting, diarrhea. Usually viral, resolves in 1-3 days." },
      { condition: "Gallstones (Cholecystitis)", likelihood: "medium", notes: "Right upper quadrant pain after fatty meals. May radiate to right shoulder. May need surgery." },
      { condition: "Kidney Stones", likelihood: "medium", notes: "Severe flank pain radiating to groin, blood in urine. Pain comes in waves." },
      { condition: "Peptic Ulcer Disease", likelihood: "medium", notes: "Burning upper abdominal pain, worse on empty stomach, relieved by food. May have dark stools." },
      { condition: "Irritable Bowel Syndrome (IBS)", likelihood: "medium", notes: "Crampy pain related to bowel movements, alternating constipation/diarrhea. Chronic condition." },
      { condition: "Inflammatory Bowel Disease (Crohn's/UC)", likelihood: "low", notes: "Chronic abdominal pain, diarrhea, weight loss, blood in stool." },
      { condition: "Diverticulitis", likelihood: "low", notes: "Left lower quadrant pain, fever, change in bowel habits. Common in older adults." },
      { condition: "Ovarian Cyst/Torsion", likelihood: "low", notes: "Sudden lower abdominal pain in females. May need emergency surgery if torsion." },
      { condition: "Ectopic Pregnancy", likelihood: "low", notes: "Lower abdominal pain with vaginal bleeding in pregnant women. Emergency." },
      { condition: "Urinary Tract Infection", likelihood: "medium", notes: "Lower abdominal pain with burning urination, frequency, urgency." },
      { condition: "Constipation", likelihood: "high", notes: "Crampy lower abdominal pain, infrequent stools. Common and usually benign." },
      { condition: "GERD/Acid Reflux", likelihood: "high", notes: "Burning upper abdominal pain, worse after eating, with heartburn." },
      { condition: "Pancreatitis", likelihood: "low", notes: "Severe upper abdominal pain radiating to back, nausea, vomiting. Often from gallstones or alcohol." },
      { condition: "Bowel Obstruction", likelihood: "low", notes: "Crampy abdominal pain, vomiting, no bowel movements/gas. Emergency." },
    ],
    redFlags: [
      "Severe, sudden abdominal pain",
      "Abdominal pain with high fever",
      "Blood in vomit or stool",
      "Persistent vomiting — can't keep fluids down",
      "Abdomen rigid or tender to touch",
      "Pain during pregnancy",
      "Yellowing of skin/eyes (jaundice)",
      "Unexplained weight loss with abdominal pain",
    ],
  },
  "fever": {
    name: "Fever",
    description: "Body temperature above 100.4°F (38°C). Can be accompanied by chills, sweating, body aches, and fatigue. The body's natural response to infection.",
    bodySystem: "Systemic/Immune",
    severity: "moderate",
    possibleCauses: [
      { condition: "Viral Upper Respiratory Infection (Common Cold/Flu)", likelihood: "high", notes: "Fever with cough, sore throat, runny nose, body aches. Usually resolves in 5-7 days." },
      { condition: "Influenza (Flu)", likelihood: "high", notes: "Sudden high fever, severe body aches, dry cough, extreme fatigue. Seasonal." },
      { condition: "COVID-19", likelihood: "high", notes: "Fever, cough, shortness of breath, loss of taste/smell. Test for SARS-CoV-2." },
      { condition: "Bacterial Infection", likelihood: "medium", notes: "Fever with localized symptoms (e.g., ear pain, urinary symptoms, skin redness). May need antibiotics." },
      { condition: "Pneumonia", likelihood: "medium", notes: "Fever with cough, productive sputum, shortness of breath, chest pain." },
      { condition: "Urinary Tract Infection", likelihood: "medium", notes: "Fever with burning urination, frequency, urgency, flank pain." },
      { condition: "Gastroenteritis", likelihood: "medium", notes: "Fever with nausea, vomiting, diarrhea. Usually viral." },
      { condition: "Strep Throat", likelihood: "medium", notes: "Fever with severe sore throat, no cough, swollen tonsils. Needs antibiotics." },
      { condition: "Mononucleosis", likelihood: "low", notes: "Fever, severe fatigue, sore throat, swollen lymph nodes. Caused by Epstein-Barr virus." },
      { condition: "Meningitis", likelihood: "low", notes: "Fever with severe headache, stiff neck, sensitivity to light. Emergency." },
      { condition: "Sepsis", likelihood: "low", notes: "High fever, rapid heart rate, rapid breathing, confusion. Life-threatening emergency." },
      { condition: "Heat Exhaustion/Heat Stroke", likelihood: "low", notes: "High fever after heat exposure. May have hot dry skin (heat stroke). Emergency." },
      { condition: "Malaria", likelihood: "low", notes: "Cyclical fever with chills, sweating. Consider if recent travel to endemic areas." },
      { condition: "Appendicitis", likelihood: "low", notes: "Fever with migrating abdominal pain to right lower quadrant." },
      { condition: "Cellulitis/Skin Infection", likelihood: "low", notes: "Fever with red, swollen, warm, tender skin area." },
    ],
    redFlags: [
      "Fever above 103°F (39.4°C) in adults",
      "Fever above 100.4°F (38°C) in infants under 3 months",
      "Fever with stiff neck and severe headache",
      "Fever with difficulty breathing",
      "Fever with persistent vomiting",
      "Fever with confusion or altered mental state",
      "Fever lasting more than 3 days",
      "Fever with rash that doesn't fade when pressed",
      "Fever after recent travel to tropical areas",
      "Fever in immunocompromised patients",
    ],
  },
  "shortness_of_breath": {
    name: "Shortness of Breath (Dyspnea)",
    description: "Difficulty breathing, feeling like you can't get enough air. Can occur at rest or with exertion. May be acute or chronic.",
    bodySystem: "Respiratory/Cardiovascular",
    severity: "severe",
    possibleCauses: [
      { condition: "Asthma", likelihood: "high", notes: "Wheezing, chest tightness, cough. Triggered by allergens, exercise, cold air. Reversible with inhalers." },
      { condition: "Chronic Obstructive Pulmonary Disease (COPD)", likelihood: "medium", notes: "Progressive shortness of breath, chronic cough, history of smoking." },
      { condition: "Heart Failure", likelihood: "medium", notes: "Shortness of breath worse when lying flat, leg swelling, fatigue. May need diuretics." },
      { condition: "Pneumonia", likelihood: "medium", notes: "Shortness of breath with fever, cough, productive sputum, chest pain." },
      { condition: "Pulmonary Embolism", likelihood: "medium", notes: "Sudden shortness of breath, chest pain, may have leg swelling. Emergency." },
      { condition: "Anxiety/Panic Disorder", likelihood: "medium", notes: "Sudden shortness of breath, chest tightness, racing heart, fear. No underlying lung disease." },
      { condition: "Anemia", likelihood: "medium", notes: "Gradual onset shortness of breath, fatigue, pale skin. Check hemoglobin." },
      { condition: "COVID-19", likelihood: "high", notes: "Shortness of breath with fever, cough, loss of taste/smell. May progress rapidly." },
      { condition: "Pneumothorax", likelihood: "low", notes: "Sudden shortness of breath with sharp chest pain. Collapsed lung. Emergency." },
      { condition: "Pulmonary Edema", likelihood: "low", notes: "Acute shortness of breath, pink frothy sputum, crackles on exam. Emergency." },
      { condition: "Coronary Artery Disease", likelihood: "medium", notes: "Shortness of breath with exertion, may have chest pain. May indicate heart disease." },
      { condition: "Interstitial Lung Disease", likelihood: "low", notes: "Progressive shortness of breath, dry cough. Chronic scarring of lung tissue." },
      { condition: "Obesity-Related", likelihood: "low", notes: "Shortness of breath with exertion in overweight individuals. Improves with weight loss." },
      { condition: "Deconditioning", likelihood: "low", notes: "Shortness of breath with exertion in sedentary individuals. Improves with exercise." },
    ],
    redFlags: [
      "Sudden onset severe shortness of breath",
      "Shortness of breath at rest",
      "Blue lips or fingertips (cyanosis)",
      "Shortness of breath with chest pain",
      "Unable to speak full sentences without pausing to breathe",
      "Rapid breathing (>24 breaths/min)",
      "Low oxygen saturation (<90%)",
      "Shortness of breath with swelling in legs",
      "Shortness of breath that wakes you from sleep",
    ],
  },
  "fatigue": {
    name: "Fatigue",
    description: "Persistent tiredness, lack of energy, or exhaustion that is not relieved by rest. Can be physical, mental, or both. One of the most common medical complaints.",
    bodySystem: "Systemic",
    severity: "mild",
    possibleCauses: [
      { condition: "Iron Deficiency Anemia", likelihood: "high", notes: "Fatigue, pale skin, shortness of breath. Common in women with heavy periods. Check ferritin." },
      { condition: "Hypothyroidism", likelihood: "high", notes: "Fatigue, weight gain, cold intolerance, dry skin, hair loss. Check TSH." },
      { condition: "Vitamin D Deficiency", likelihood: "high", notes: "Fatigue, bone pain, muscle weakness. Common in winter/indoor lifestyles." },
      { condition: "Vitamin B12 Deficiency", likelihood: "medium", notes: "Fatigue, tingling/numbness, memory issues. Common in vegans/elderly." },
      { condition: "Sleep Apnea", likelihood: "medium", notes: "Fatigue despite sleeping 8+ hours, loud snoring, morning headaches. Partner may notice pauses in breathing." },
      { condition: "Depression", likelihood: "medium", notes: "Fatigue, low mood, loss of interest, changes in appetite/sleep. May need screening (PHQ-9)." },
      { condition: "Chronic Fatigue Syndrome", likelihood: "low", notes: "Severe fatigue lasting >6 months, not relieved by rest, worse after exertion. Diagnosis of exclusion." },
      { condition: "Diabetes Mellitus", likelihood: "medium", notes: "Fatigue, excessive thirst, frequent urination, weight changes. Check fasting glucose/HbA1c." },
      { condition: "Heart Disease", likelihood: "medium", notes: "Fatigue with exertion, may have chest pain, shortness of breath. More common in older adults." },
      { condition: "Kidney Disease", likelihood: "low", notes: "Fatigue, swelling, changes in urination. Check creatinine/eGFR." },
      { condition: "Liver Disease", likelihood: "low", notes: "Fatigue, jaundice, abdominal swelling. Check liver function tests." },
      { condition: "Mononucleosis", likelihood: "medium", notes: "Severe fatigue, sore throat, swollen glands. Caused by EBV. Can last weeks." },
      { condition: "Fibromyalgia", likelihood: "low", notes: "Widespread pain, fatigue, sleep problems, memory issues." },
      { condition: "Medication Side Effects", likelihood: "medium", notes: "Many medications cause fatigue (antihistamines, beta-blockers, antidepressants, statins)." },
      { condition: "Dehydration", likelihood: "high", notes: "Fatigue, dizziness, dark urine, dry mouth. Resolves with hydration." },
      { condition: "Inactive Lifestyle", likelihood: "high", notes: "Fatigue from lack of exercise. Paradoxically, exercise improves energy." },
    ],
    redFlags: [
      "Sudden or severe fatigue",
      "Fatigue with unexplained weight loss",
      "Fatigue with chest pain or shortness of breath",
      "Fatigue with bleeding or bruising easily",
      "Fatigue with fever",
      "Fatigue severe enough to interfere with daily activities",
      "Fatigue lasting more than 2 weeks without clear cause",
    ],
  },
  "dizziness": {
    name: "Dizziness",
    description: "Feeling lightheaded, unsteady, or a sensation of spinning (vertigo). Can be accompanied by nausea, balance problems, or feeling faint.",
    bodySystem: "Neurological/Vestibular",
    severity: "moderate",
    possibleCauses: [
      { condition: "Benign Paroxysmal Positional Vertigo (BPPV)", likelihood: "high", notes: "Brief episodes of vertigo triggered by head position changes. Treated with Epley maneuver." },
      { condition: "Orthostatic Hypotension", likelihood: "high", notes: "Lightheadedness when standing up quickly. Related to blood pressure drop. Common with dehydration/medications." },
      { condition: "Dehydration", likelihood: "high", notes: "Lightheadedness, dry mouth, dark urine. Resolves with fluids." },
      { condition: "Inner Ear Infection (Labyrinthitis)", likelihood: "medium", notes: "Sudden vertigo, nausea, vomiting. May follow upper respiratory infection. Lasts days to weeks." },
      { condition: "Meniere's Disease", likelihood: "low", notes: "Episodes of vertigo, hearing loss, tinnitus, ear fullness. Chronic inner ear condition." },
      { condition: "Anemia", likelihood: "medium", notes: "Lightheadedness, fatigue, pale skin. Check hemoglobin." },
      { condition: "Hypoglycemia (Low Blood Sugar)", likelihood: "medium", notes: "Dizziness, sweating, shaking, confusion. Resolves with sugar intake. Common in diabetics." },
      { condition: "Medication Side Effects", likelihood: "high", notes: "Many medications cause dizziness (blood pressure meds, antidepressants, sedatives)." },
      { condition: "Anxiety/Hyperventilation", likelihood: "medium", notes: "Lightheadedness, tingling fingers, shortness of breath. From breathing too fast." },
      { condition: "Stroke/TIA", likelihood: "low", notes: "Sudden dizziness with other neurological symptoms (weakness, speech difficulty). Emergency." },
      { condition: "Cardiac Arrhythmia", likelihood: "medium", notes: "Dizziness with palpitations, may have chest pain. Check ECG." },
      { condition: "Cervical Vertigo", likelihood: "low", notes: "Dizziness related to neck movement. May be from neck arthritis." },
      { condition: "Vestibular Migraine", likelihood: "low", notes: "Vertigo with or without headache. May have sensitivity to light/sound." },
    ],
    redFlags: [
      "Sudden severe dizziness/vertigo",
      "Dizziness with difficulty speaking or weakness on one side",
      "Dizziness with chest pain or irregular heartbeat",
      "Dizziness after head injury",
      "Dizziness with fainting/loss of consciousness",
      "Persistent dizziness lasting days",
      "Dizziness with severe headache",
      "Dizziness with double vision or vision loss",
    ],
  },
  "nausea_vomiting": {
    name: "Nausea and Vomiting",
    description: "Feeling the urge to vomit (nausea) and expelling stomach contents (vomiting). Can be acute or chronic, with many possible causes.",
    bodySystem: "Gastrointestinal",
    severity: "moderate",
    possibleCauses: [
      { condition: "Gastroenteritis (Stomach Bug)", likelihood: "high", notes: "Nausea, vomiting, diarrhea. Usually viral. Resolves in 1-3 days. Stay hydrated." },
      { condition: "Food Poisoning", likelihood: "high", notes: "Sudden nausea/vomiting after eating questionable food. May have diarrhea. Usually resolves in 24-48 hours." },
      { condition: "Pregnancy (Morning Sickness)", likelihood: "medium", notes: "Nausea/vomiting, especially morning. Consider pregnancy test in women of childbearing age." },
      { condition: "Medication Side Effects", likelihood: "high", notes: "Many medications cause nausea (antibiotics, NSAIDs, opioids, chemotherapy)." },
      { condition: "Motion Sickness", likelihood: "medium", notes: "Nausea triggered by movement (car, boat, plane). Prevent with motion sickness meds." },
      { condition: "Migraine", likelihood: "medium", notes: "Nausea/vomiting with severe headache, sensitivity to light/sound." },
      { condition: "GERD/Acid Reflux", likelihood: "medium", notes: "Nausea, heartburn, worse after eating or lying down." },
      { condition: "Appendicitis", likelihood: "low", notes: "Nausea/vomiting with abdominal pain migrating to right lower quadrant." },
      { condition: "Gallbladder Disease", likelihood: "medium", notes: "Nausea/vomiting after fatty meals, right upper quadrant pain." },
      { condition: "Pancreatitis", likelihood: "low", notes: "Severe nausea/vomiting with upper abdominal pain radiating to back." },
      { condition: "Intestinal Obstruction", likelihood: "low", notes: "Vomiting, abdominal pain, no bowel movements. Emergency." },
      { condition: "Concussion/Head Injury", likelihood: "low", notes: "Nausea/vomiting after head injury. May indicate brain injury." },
      { condition: "Kidney Stones", likelihood: "low", notes: "Severe flank pain with nausea/vomiting." },
      { condition: "Alcohol/Substance Withdrawal", likelihood: "medium", notes: "Nausea/vomiting, tremors, sweating after stopping alcohol/drugs." },
    ],
    redFlags: [
      "Vomiting blood or material that looks like coffee grounds",
      "Vomiting with severe abdominal pain",
      "Vomiting after head injury",
      "Persistent vomiting — can't keep fluids down for >24 hours",
      "Vomiting with high fever",
      "Vomiting with signs of dehydration (dry mouth, no urination, dizziness)",
      "Vomiting during pregnancy with weight loss (hyperemesis gravidarum)",
      "Projectile vomiting in infants",
    ],
  },
  "joint_pain": {
    name: "Joint Pain",
    description: "Pain, stiffness, or swelling in one or more joints. Can be acute or chronic, affecting mobility and quality of life.",
    bodySystem: "Musculoskeletal",
    severity: "moderate",
    possibleCauses: [
      { condition: "Osteoarthritis", likelihood: "high", notes: "Gradual onset joint pain, worse with activity, better with rest. Morning stiffness <30 min. Most common type." },
      { condition: "Rheumatoid Arthritis", likelihood: "medium", notes: "Symmetric joint pain, morning stiffness >1 hour, joint swelling. Autoimmune. Check RF, anti-CCP." },
      { condition: "Gout", likelihood: "medium", notes: "Sudden severe pain, usually big toe, red/hot joint. Caused by uric acid crystals. Check uric acid." },
      { condition: "Tendonitis", likelihood: "medium", notes: "Pain around a joint, worse with movement. From overuse or injury." },
      { condition: "Bursitis", likelihood: "medium", notes: "Joint pain and swelling, often shoulder/hip/knee. Inflammation of bursa." },
      { condition: "Lupus (SLE)", likelihood: "low", notes: "Joint pain, rash, fatigue. Autoimmune disease. Check ANA." },
      { condition: "Psoriatic Arthritis", likelihood: "low", notes: "Joint pain with psoriasis skin lesions. May affect nails." },
      { condition: "Ankylosing Spondylitis", likelihood: "low", notes: "Lower back pain, morning stiffness, improves with exercise. HLA-B27 positive." },
      { condition: "Lyme Disease", likelihood: "low", notes: "Joint pain after tick bite, may have rash (erythema migrans). Check Lyme serology." },
      { condition: "Septic Arthritis", likelihood: "low", notes: "Sudden severe joint pain, fever, hot/swollen joint. Emergency — joint infection." },
      { condition: "Fibromyalgia", likelihood: "low", notes: "Widespread pain, fatigue, sleep problems. No joint swelling." },
      { condition: "Injury/Trauma", likelihood: "high", notes: "Joint pain after injury — sprain, strain, or fracture." },
      { condition: "Overuse/Repetitive Strain", likelihood: "high", notes: "Joint pain from repetitive activities. Common in athletes, office workers." },
    ],
    redFlags: [
      "Joint pain with fever and hot/swollen joint (septic arthritis)",
      "Sudden severe joint pain with inability to bear weight",
      "Joint pain after significant trauma",
      "Progressive joint deformity",
      "Joint pain with systemic symptoms (fever, weight loss, rash)",
      "Morning stiffness lasting more than 1 hour",
      "Joint pain affecting multiple joints symmetrically",
    ],
  },
  "skin_rash": {
    name: "Skin Rash",
    description: "Any change in skin color, texture, or appearance. Can be red, itchy, scaly, bumpy, or blistering. May be localized or widespread.",
    bodySystem: "Dermatological",
    severity: "mild",
    possibleCauses: [
      { condition: "Contact Dermatitis", likelihood: "high", notes: "Red, itchy rash at site of contact with irritant/allergen (poison ivy, nickel, soap). Resolves with avoidance and topical steroids." },
      { condition: "Eczema (Atopic Dermatitis)", likelihood: "high", notes: "Dry, itchy, red patches, often in creases of elbows/knees. Chronic, relapsing." },
      { condition: "Hives (Urticaria)", likelihood: "medium", notes: "Raised, itchy welts. Often from allergies (food, medication, insect bites). May be acute or chronic." },
      { condition: "Psoriasis", likelihood: "medium", notes: "Red, scaly plaques, often on elbows, knees, scalp. Chronic autoimmune condition." },
      { condition: "Rosacea", likelihood: "medium", notes: "Facial redness, visible blood vessels, sometimes acne-like bumps. Triggered by heat, alcohol, spicy food." },
      { condition: "Fungal Infection (Ringworm)", likelihood: "medium", notes: "Red, circular, scaly rash with clear center. Contagious. Treated with antifungal cream." },
      { condition: "Viral Rash", likelihood: "medium", notes: "Rash with fever — may be measles, chickenpox, roseola, fifth disease. Depends on age and pattern." },
      { condition: "Shingles (Herpes Zoster)", likelihood: "medium", notes: "Painful blistering rash in a stripe on one side of body. From reactivated chickenpox virus." },
      { condition: "Drug Rash", likelihood: "medium", notes: "Rash after starting new medication. May be allergic reaction. Stop medication and consult doctor." },
      { condition: "Heat Rash (Miliaria)", likelihood: "low", notes: "Small red bumps in hot, humid weather. Resolves with cooling." },
      { condition: "Scabies", likelihood: "low", notes: "Intensely itchy rash, worse at night, between fingers, at wrists/waist. Caused by mites. Contagious." },
      { condition: "Lyme Disease (Erythema Migrans)", likelihood: "low", notes: "Bull's-eye rash after tick bite. May have fever, fatigue. Needs antibiotics." },
      { condition: "Stevens-Johnson Syndrome", likelihood: "low", notes: "Severe rash with blistering, mouth sores, fever. Medical emergency. Usually drug reaction." },
    ],
    redFlags: [
      "Rash that spreads rapidly",
      "Rash with high fever",
      "Rash with blistering or skin peeling",
      "Rash with mouth/eye involvement",
      "Purple/bruise-like rash that doesn't fade when pressed",
      "Rash with difficulty breathing (anaphylaxis)",
      "Rash after starting new medication",
      "Rash with severe pain",
    ],
  },
  "back_pain": {
    name: "Back Pain",
    description: "Pain in the upper, middle, or lower back. Can be acute or chronic, dull or sharp, and may radiate to the legs or arms.",
    bodySystem: "Musculoskeletal",
    severity: "moderate",
    possibleCauses: [
      { condition: "Muscle Strain", likelihood: "high", notes: "Most common cause. Pain after lifting, twisting, or sudden movement. Improves with rest, ice/heat, NSAIDs." },
      { condition: "Herniated Disc", likelihood: "medium", notes: "Lower back pain radiating down leg (sciatica). May have numbness/tingling. Worse with sitting." },
      { condition: "Degenerative Disc Disease", likelihood: "medium", notes: "Chronic back pain, worse with sitting, better with walking. Age-related disc wear." },
      { condition: "Spinal Stenosis", likelihood: "medium", notes: "Back pain worse with walking, relieved by sitting/leaning forward. Common in older adults." },
      { condition: "Scoliosis", likelihood: "low", notes: "Abnormal spinal curvature, may cause back pain. Usually detected in adolescence." },
      { condition: "Kidney Stones", likelihood: "medium", notes: "Severe flank/back pain radiating to groin, blood in urine. Colicky pain." },
      { condition: "Kidney Infection (Pyelonephritis)", likelihood: "low", notes: "Back/flank pain with fever, chills, urinary symptoms. Needs antibiotics." },
      { condition: "Osteoporosis with Compression Fracture", likelihood: "low", notes: "Sudden back pain in older adults, especially women. May have height loss." },
      { condition: "Ankylosing Spondylitis", likelihood: "low", notes: "Chronic lower back pain, morning stiffness, improves with exercise. Young adults." },
      { condition: "Fibromyalgia", likelihood: "low", notes: "Widespread pain including back, fatigue, sleep problems." },
      { condition: "Poor Posture", likelihood: "high", notes: "Back pain from prolonged sitting, poor ergonomics. Improves with posture correction and exercise." },
      { condition: "Pregnancy-Related", likelihood: "medium", notes: "Lower back pain during pregnancy, especially third trimester. From weight gain and posture changes." },
      { condition: "Cauda Equina Syndrome", likelihood: "low", notes: "Severe back pain with bladder/bowel dysfunction, saddle numbness. Emergency." },
    ],
    redFlags: [
      "Back pain with loss of bladder/bowel control",
      "Back pain with saddle numbness (groin area)",
      "Back pain after significant trauma",
      "Back pain with unexplained weight loss",
      "Back pain with fever",
      "Back pain with progressive leg weakness",
      "Back pain that worsens at night",
      "Back pain in person with cancer history",
    ],
  },
  "cough": {
    name: "Cough",
    description: "Forceful expulsion of air from the lungs. Can be dry or productive (with phlegm). Acute (<3 weeks) or chronic (>8 weeks).",
    bodySystem: "Respiratory",
    severity: "mild",
    possibleCauses: [
      { condition: "Viral Upper Respiratory Infection", likelihood: "high", notes: "Most common cause of acute cough. With runny nose, sore throat. Resolves in 1-2 weeks." },
      { condition: "Post-Viral Cough", likelihood: "high", notes: "Cough lasting 3-8 weeks after viral infection. Due to airway hypersensitivity." },
      { condition: "Allergic Rhinitis/Postnasal Drip", likelihood: "high", notes: "Chronic cough, worse at night, with nasal congestion, itchy eyes." },
      { condition: "GERD", likelihood: "medium", notes: "Chronic dry cough, worse at night/lying down, with heartburn. Acid irritates airways." },
      { condition: "Asthma", likelihood: "medium", notes: "Cough with wheezing, chest tightness. May be cough-variant asthma (cough only)." },
      { condition: "Chronic Bronchitis/COPD", likelihood: "medium", notes: "Chronic productive cough, history of smoking. Worse in mornings." },
      { condition: "Pneumonia", likelihood: "medium", notes: "Productive cough with fever, shortness of breath, chest pain. May need antibiotics." },
      { condition: "COVID-19", likelihood: "high", notes: "Dry cough with fever, shortness of breath, loss of taste/smell." },
      { condition: "Medication-Induced (ACE Inhibitors)", likelihood: "medium", notes: "Dry cough in patients taking ACE inhibitors (lisinopril, enalapril). Switch medication." },
      { condition: "Pertussis (Whooping Cough)", likelihood: "low", notes: "Severe coughing fits followed by whoop sound. Preventable by vaccine." },
      { condition: "Tuberculosis", likelihood: "low", notes: "Chronic cough, blood-tinged sputum, night sweats, weight loss. Consider risk factors." },
      { condition: "Lung Cancer", likelihood: "low", notes: "Chronic cough, change in cough pattern, blood in sputum, weight loss. Especially in smokers." },
      { condition: "Heart Failure", likelihood: "low", notes: "Chronic cough, worse when lying flat, may have pink frothy sputum, leg swelling." },
    ],
    redFlags: [
      "Coughing up blood (hemoptysis)",
      "Cough with severe shortness of breath",
      "Cough with high fever and chest pain",
      "Chronic cough lasting more than 8 weeks",
      "Cough with significant weight loss",
      "Cough with night sweats",
      "Cough in smoker that changes in character",
      "Cough causing vomiting or rib fractures",
    ],
  },
};

// =============================================================================
// MEDICAL.SYMPTOMS — Symptom assessment tool
// =============================================================================

export const medicalSymptoms: ToolDef = {
  name: "medical.symptoms",
  description: "Perform a thorough symptom assessment. Given one or more symptoms, returns possible conditions ranked by likelihood, red flag symptoms to watch for, body system affected, severity level, and recommended next steps. The assessment considers symptom combinations, duration, and patient context. ALWAYS include a medical disclaimer — this is for educational purposes only and not a substitute for professional medical advice.",
  inputSchema: z.object({
    symptoms: z.array(z.string()).describe("List of symptoms (e.g. ['chest_pain', 'shortness_of_breath']). Available: chest_pain, headache, abdominal_pain, fever, shortness_of_breath, fatigue, dizziness, nausea_vomiting, joint_pain, skin_rash, back_pain, cough"),
    patient_context: z.object({
      age: z.number().optional().describe("Patient age"),
      sex: z.enum(["male", "female", "other"]).optional().describe("Biological sex"),
      duration: z.string().optional().describe("How long symptoms have been present (e.g. '2 days', 'chronic')"),
      severity: z.enum(["mild", "moderate", "severe"]).optional().describe("Symptom severity"),
      medical_history: z.array(z.string()).optional().describe("Relevant medical history (e.g. ['diabetes', 'hypertension'])"),
      medications: z.array(z.string()).optional().describe("Current medications"),
    }).optional().describe("Patient context for more accurate assessment"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    assessment: z.string(),
    possible_conditions: z.array(z.object({
      condition: z.string(),
      likelihood: z.string(),
      match_score: z.number(),
      notes: z.string(),
    })),
    red_flags: z.array(z.string()),
    severity: z.string(),
    body_systems: z.array(z.string()),
    recommended_actions: z.array(z.string()),
    disclaimer: z.string(),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ symptoms, patient_context }) {
    const disclaimer = "MEDICAL DISCLAIMER: This assessment is for educational and informational purposes only. It is NOT a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider with any health concerns. In an emergency, call 911 or your local emergency number immediately.";

    const allRedFlags: string[] = [];
    const allBodySystems: string[] = [];
    const conditionScores: Record<string, { score: number; likelihood: string; notes: string }> = {};
    let maxSeverity = "mild";

    for (const symptomKey of symptoms) {
      const symptom = SYMPTOMS[symptomKey];
      if (!symptom) {
        continue;
      }

      // Collect red flags
      allRedFlags.push(...symptom.redFlags);
      if (!allBodySystems.includes(symptom.bodySystem)) {
        allBodySystems.push(symptom.bodySystem);
      }

      // Track severity
      const severityOrder = { mild: 0, moderate: 1, severe: 2, emergency: 3 };
      if (severityOrder[symptom.severity] > severityOrder[maxSeverity as keyof typeof severityOrder]) {
        maxSeverity = symptom.severity;
      }

      // Score conditions
      for (const cause of symptom.possibleCauses) {
        if (!conditionScores[cause.condition]) {
          conditionScores[cause.condition] = { score: 0, likelihood: cause.likelihood, notes: cause.notes };
        }
        // Add score based on likelihood
        const scoreMap = { high: 3, medium: 2, low: 1 };
        conditionScores[cause.condition]!.score += scoreMap[cause.likelihood];
      }
    }

    // Adjust scores based on patient context
    if (patient_context) {
      const ctx = patient_context;
      // Age-based adjustments
      if (ctx.age) {
        if (ctx.age > 50) {
          if (conditionScores["Coronary Artery Disease"]) conditionScores["Coronary Artery Disease"].score += 2;
          if (conditionScores["Temporal Arteritis"]) conditionScores["Temporal Arteritis"].score += 2;
          if (conditionScores["Osteoporosis with Compression Fracture"]) conditionScores["Osteoporosis with Compression Fracture"].score += 2;
          if (conditionScores["Diverticulitis"]) conditionScores["Diverticulitis"].score += 1;
        }
        if (ctx.age < 30) {
          if (conditionScores["Anxiety/Panic Attack"]) conditionScores["Anxiety/Panic Attack"].score += 1;
          if (conditionScores["Ankylosing Spondylitis"]) conditionScores["Ankylosing Spondylitis"].score += 1;
        }
      }

      // Sex-based adjustments
      if (ctx.sex === "female") {
        if (conditionScores["Iron Deficiency Anemia"]) conditionScores["Iron Deficiency Anemia"].score += 1;
        if (conditionScores["Pregnancy (Morning Sickness)"]) conditionScores["Pregnancy (Morning Sickness)"].score += 1;
        if (conditionScores["Ovarian Cyst/Torsion"]) conditionScores["Ovarian Cyst/Torsion"].score += 1;
        if (conditionScores["Ectopic Pregnancy"]) conditionScores["Ectopic Pregnancy"].score += 1;
        if (conditionScores["Fibromyalgia"]) conditionScores["Fibromyalgia"].score += 1;
      }

      // Medical history adjustments
      if (ctx.medical_history) {
        for (const hist of ctx.medical_history) {
          const histLower = hist.toLowerCase();
          if (histLower.includes("diabetes")) {
            if (conditionScores["Coronary Artery Disease"]) conditionScores["Coronary Artery Disease"].score += 2;
            if (conditionScores["Kidney Disease"]) conditionScores["Kidney Disease"].score += 1;
          }
          if (histLower.includes("hypertension") || histLower.includes("high blood pressure")) {
            if (conditionScores["Myocardial Infarction (Heart Attack)"]) conditionScores["Myocardial Infarction (Heart Attack)"].score += 1;
            if (conditionScores["Stroke/TIA"]) conditionScores["Stroke/TIA"].score += 1;
          }
          if (histLower.includes("smok")) {
            if (conditionScores["COPD"]) conditionScores["COPD"].score += 2;
            if (conditionScores["Lung Cancer"]) conditionScores["Lung Cancer"].score += 2;
            if (conditionScores["Coronary Artery Disease"]) conditionScores["Coronary Artery Disease"].score += 2;
          }
          if (histLower.includes("asthma")) {
            if (conditionScores["Asthma"]) conditionScores["Asthma"].score += 3;
          }
          if (histLower.includes("cancer")) {
            if (conditionScores["Lung Cancer"]) conditionScores["Lung Cancer"].score += 2;
            if (conditionScores["Osteoporosis with Compression Fracture"]) conditionScores["Osteoporosis with Compression Fracture"].score += 2;
          }
        }
      }

      // Medication adjustments
      if (ctx.medications) {
        for (const med of ctx.medications) {
          const medLower = med.toLowerCase();
          if (medLower.includes("lisinopril") || medLower.includes("enalapril") || medLower.includes("ace")) {
            if (conditionScores["Medication-Induced (ACE Inhibitors)"]) conditionScores["Medication-Induced (ACE Inhibitors)"].score += 3;
          }
          if (medLower.includes("nsaid") || medLower.includes("ibuprofen") || medLower.includes("naproxen")) {
            if (conditionScores["Peptic Ulcer Disease"]) conditionScores["Peptic Ulcer Disease"].score += 1;
            if (conditionScores["GERD/Acid Reflux"]) conditionScores["GERD/Acid Reflux"].score += 1;
          }
        }
      }
    }

    // Sort conditions by score
    const sortedConditions = Object.entries(conditionScores)
      .map(([condition, data]) => ({
        condition,
        likelihood: data.likelihood,
        match_score: data.score,
        notes: data.notes,
      }))
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 10);

    // Generate recommended actions
    const recommendedActions: string[] = [];
    if (maxSeverity === "emergency") {
      recommendedActions.push("SEEK EMERGENCY MEDICAL CARE IMMEDIATELY — Call 911 or go to the nearest emergency room");
    } else if (maxSeverity === "severe") {
      recommendedActions.push("Seek medical attention within 24 hours — contact your doctor or visit urgent care");
    } else if (maxSeverity === "moderate") {
      recommendedActions.push("Schedule an appointment with your healthcare provider within 1-3 days");
      recommendedActions.push("Monitor symptoms closely and seek immediate care if they worsen");
    } else {
      recommendedActions.push("Self-care may be appropriate — rest, hydration, and over-the-counter remedies");
      recommendedActions.push("Schedule a routine appointment if symptoms persist beyond 1-2 weeks");
    }

    // Check for specific red flag combinations
    if (symptoms.includes("chest_pain") && symptoms.includes("shortness_of_breath")) {
      recommendedActions.unshift("URGENT: Chest pain with shortness of breath may indicate a heart attack or pulmonary embolism — seek emergency care immediately");
    }
    if (symptoms.includes("fever") && symptoms.includes("headache")) {
      recommendedActions.unshift("WARNING: Fever with severe headache may indicate meningitis — seek immediate medical care if stiff neck or light sensitivity is present");
    }
    if (symptoms.includes("fever") && symptoms.includes("abdominal_pain")) {
      recommendedActions.unshift("WARNING: Fever with abdominal pain may indicate appendicitis or other serious infection — seek medical care promptly");
    }

    recommendedActions.push("This assessment is not a diagnosis — consult a healthcare professional for proper evaluation");
    recommendedActions.push("Bring a list of your symptoms, their duration, and any medications you are taking to your appointment");

    // Generate assessment summary
    const assessment = `Symptom Assessment for: ${symptoms.join(", ")}.
Body systems involved: ${allBodySystems.join(", ")}.
Severity level: ${maxSeverity}.
${sortedConditions.length} possible conditions identified.
Top match: ${sortedConditions[0]?.condition ?? "None"} (score: ${sortedConditions[0]?.match_score ?? 0}).
${allRedFlags.length} red flag symptoms to monitor.
${maxSeverity === "emergency" ? "EMERGENCY: Seek immediate medical care." : maxSeverity === "severe" ? "URGENT: Seek medical care within 24 hours." : "Monitor and consult healthcare provider if symptoms persist or worsen."}`;

    return {
      success: true,
      assessment,
      possible_conditions: sortedConditions,
      red_flags: [...new Set(allRedFlags)],
      severity: maxSeverity,
      body_systems: allBodySystems,
      recommended_actions: recommendedActions,
      disclaimer,
      message: assessment,
    };
  },
};

// =============================================================================
// DRUG DATABASE — medication information, interactions, dosing
// =============================================================================

interface DrugInfo {
  name: string;
  genericName: string;
  drugClass: string;
  indications: string[];
  mechanism: string;
  commonSideEffects: string[];
  seriousSideEffects: string[];
  contraindications: string[];
  interactions: string[];
  typicalDosing: string;
  pregnancyCategory: string;
  notes: string;
}

const DRUGS: Record<string, DrugInfo> = {
  "acetaminophen": {
    name: "Acetaminophen (Tylenol)",
    genericName: "acetaminophen",
    drugClass: "Analgesic, Antipyretic",
    indications: ["Pain relief", "Fever reduction"],
    mechanism: "Inhibits cyclooxygenase (COX) in the central nervous system, reducing prostaglandin synthesis. Does not have significant anti-inflammatory effects.",
    commonSideEffects: ["Generally well tolerated at recommended doses", "Rare: nausea, rash"],
    seriousSideEffects: ["Liver damage/hepatotoxicity (in overdose or with alcohol)", "Allergic reaction (rare)"],
    contraindications: ["Severe liver disease", "Known allergy to acetaminophen"],
    interactions: ["Warfarin (increased bleeding risk with regular high doses)", "Alcohol (increased liver toxicity risk)"],
    typicalDosing: "Adults: 325-650 mg every 4-6 hours, max 3-4 g/day. Children: 10-15 mg/kg every 4-6 hours.",
    pregnancyCategory: "Generally considered safe in pregnancy (Category B)",
    notes: "Leading cause of acute liver failure in the US when taken in overdose. Maximum daily dose should not exceed 3-4 grams. No anti-inflammatory effect.",
  },
  "ibuprofen": {
    name: "Ibuprofen (Advil, Motrin)",
    genericName: "ibuprofen",
    drugClass: "NSAID (Non-Steroidal Anti-Inflammatory Drug)",
    indications: ["Pain relief", "Fever reduction", "Inflammation", "Menstrual cramps", "Arthritis"],
    mechanism: "Non-selective COX inhibitor, reducing prostaglandin synthesis. Provides anti-inflammatory, analgesic, and antipyretic effects.",
    commonSideEffects: ["Stomach upset/nausea", "Heartburn", "Dizziness", "Headache"],
    seriousSideEffects: ["GI bleeding/ulcers", "Kidney damage", "Cardiovascular events (heart attack, stroke)", "Hypertension", "Allergic reactions (anaphylaxis)"],
    contraindications: ["Active GI bleeding", "Peptic ulcer disease", "Severe kidney disease", "Heart failure", "Third trimester pregnancy", "Known NSAID allergy", "Bleeding disorders"],
    interactions: ["Warfarin and other anticoagulants (increased bleeding)", "ACE inhibitors (reduced antihypertensive effect)", "Lithium (increased lithium levels)", "Methotrexate (increased toxicity)", "Other NSAIDs (additive side effects)", "Alcohol (increased GI bleeding risk)"],
    typicalDosing: "Adults: 200-400 mg every 4-6 hours, max 1.2 g/day OTC (3.2 g/day prescription). Children: 5-10 mg/kg every 6-8 hours.",
    pregnancyCategory: "Avoid in third trimester. Generally avoid in pregnancy unless benefit outweighs risk.",
    notes: "Take with food to reduce GI side effects. Do not combine with other NSAIDs. Lowest effective dose for shortest duration recommended.",
  },
  "amoxicillin": {
    name: "Amoxicillin",
    genericName: "amoxicillin",
    drugClass: "Penicillin Antibiotic",
    indications: ["Ear infections (otitis media)", "Strep throat", "Sinus infections", "Pneumonia", "Urinary tract infections", "Dental infections", "Skin infections"],
    mechanism: "Beta-lactam antibiotic that inhibits bacterial cell wall synthesis (transpeptidation), leading to cell lysis and death.",
    commonSideEffects: ["Nausea", "Diarrhea", "Rash", "Yeast infections (oral thrush, vaginal)"],
    seriousSideEffects: ["Severe allergic reaction (anaphylaxis)", "Clostridium difficile infection (severe diarrhea)", "Liver toxicity (rare)", "Stevens-Johnson syndrome (rare)"],
    contraindications: ["Penicillin allergy", "Mononucleosis (causes rash, not true allergy)"],
    interactions: ["Oral contraceptives (may reduce effectiveness — use backup method)", "Warfarin (may increase bleeding risk)", "Allopurinol (increased rash risk)", "Methotrexate (increased toxicity)"],
    typicalDosing: "Adults: 500 mg every 8 hours or 875 mg every 12 hours. Children: 20-40 mg/kg/day divided every 8 hours.",
    pregnancyCategory: "Generally considered safe in pregnancy (Category B)",
    notes: "Take complete course as prescribed even if feeling better. Common first-line antibiotic for many infections. Often combined with clavulanate (Augmentin) for resistant bacteria.",
  },
  "metformin": {
    name: "Metformin (Glucophage)",
    genericName: "metformin",
    drugClass: "Biguanide (Antidiabetic)",
    indications: ["Type 2 diabetes mellitus", "Polycystic ovary syndrome (PCOS)", "Insulin resistance"],
    mechanism: "Reduces hepatic glucose production (gluconeogenesis), decreases intestinal glucose absorption, improves insulin sensitivity. Does not stimulate insulin secretion.",
    commonSideEffects: ["GI: nausea, diarrhea, stomach upset (most common)", "Metallic taste", "Vitamin B12 deficiency (long-term use)"],
    seriousSideEffects: ["Lactic acidosis (rare but life-threatening)", "Vitamin B12 deficiency (with long-term use)"],
    contraindications: ["Severe kidney disease (eGFR <30)", "Acute kidney injury", "Metabolic acidosis", "Severe heart failure", "Severe liver disease", "Excessive alcohol use"],
    interactions: ["Contrast dye (hold metformin before/after contrast imaging)", "Alcohol (increased lactic acidosis risk)", "Cimetidine (increased metformin levels)", "Some antipsychotics (may affect blood sugar)"],
    typicalDosing: "Start: 500 mg once or twice daily with meals. Titrate up to 2000-2500 mg/day in divided doses.",
    pregnancyCategory: "Generally avoided in pregnancy. Insulin is preferred for gestational diabetes.",
    notes: "First-line treatment for Type 2 diabetes. Take with meals to reduce GI side effects. Monitor kidney function and B12 levels. Does not cause hypoglycemia when used alone.",
  },
  "lisinopril": {
    name: "Lisinopril (Prinivil, Zestril)",
    genericName: "lisinopril",
    drugClass: "ACE Inhibitor",
    indications: ["Hypertension (high blood pressure)", "Heart failure", "Post-myocardial infarction", "Diabetic nephropathy (kidney protection)"],
    mechanism: "Inhibits angiotensin-converting enzyme (ACE), reducing angiotensin II production, leading to vasodilation and reduced blood pressure. Also reduces cardiac workload.",
    commonSideEffects: ["Dry cough (5-20% of patients)", "Dizziness (especially first dose)", "Headache", "Fatigue"],
    seriousSideEffects: ["Angioedema (swelling of face/lips/throat — emergency)", "Hyperkalemia (high potassium)", "Kidney impairment", "Severe hypotension (first dose)"],
    contraindications: ["Pregnancy (can cause fetal harm)", "History of angioedema", "Bilateral renal artery stenosis", "Hereditary angioedema"],
    interactions: ["Potassium supplements and potassium-sparing diuretics (hyperkalemia)", "NSAIDs (reduced antihypertensive effect, kidney risk)", "Lithium (increased lithium levels)", "Diuretics (additive hypotensive effect)"],
    typicalDosing: "Hypertension: 10-40 mg once daily. Heart failure: 5-20 mg once daily. Start low and titrate.",
    pregnancyCategory: "Contraindicated in pregnancy (Category D — can cause fetal harm)",
    notes: "If dry cough is intolerable, switch to ARB (angiotensin receptor blocker). Monitor kidney function and potassium. Beneficial for diabetic patients (kidney protection).",
  },
  "atorvastatin": {
    name: "Atorvastatin (Lipitor)",
    genericName: "atorvastatin",
    drugClass: "HMG-CoA Reductase Inhibitor (Statin)",
    indications: ["High cholesterol (hyperlipidemia)", "Cardiovascular disease prevention", "Stroke prevention"],
    mechanism: "Inhibits HMG-CoA reductase, the rate-limiting enzyme in cholesterol synthesis in the liver. Increases LDL receptors, reducing circulating LDL cholesterol.",
    commonSideEffects: ["Muscle aches/myalgia", "GI upset", "Headache", "Elevated liver enzymes"],
    seriousSideEffects: ["Rhabdomyolysis (severe muscle breakdown — rare)", "Liver toxicity", "Diabetes (slightly increased risk)", "Cognitive effects (rare, reversible)"],
    contraindications: ["Active liver disease", "Pregnancy and breastfeeding", "Known allergy to statins"],
    interactions: ["Grapefruit juice (increases atorvastatin levels)", "Clarithromycin, itraconazole (increased statin levels, myopathy risk)", "Warfarin (may increase INR)", "Other statins/fibrates (additive myopathy risk)"],
    typicalDosing: "10-80 mg once daily, preferably in the evening. Start at 10-20 mg and titrate based on lipid goals.",
    pregnancyCategory: "Contraindicated in pregnancy (Category X)",
    notes: "Most effective LDL-lowering medication. Benefits generally outweigh risks for patients with cardiovascular disease. Monitor liver enzymes and CK if muscle symptoms occur.",
  },
  "sertraline": {
    name: "Sertraline (Zoloft)",
    genericName: "sertraline",
    drugClass: "SSRI (Selective Serotonin Reuptake Inhibitor)",
    indications: ["Major depressive disorder", "Anxiety disorders", "Panic disorder", "OCD", "PTSD", "Social anxiety disorder", "Premenstrual dysphoric disorder"],
    mechanism: "Selectively inhibits serotonin reuptake in the synaptic cleft, increasing serotonin availability and improving mood and anxiety symptoms.",
    commonSideEffects: ["Nausea (most common, usually temporary)", "Sleep changes (insomnia or drowsiness)", "Sexual dysfunction (decreased libido, delayed orgasm)", "Headache", "Dry mouth", "Sweating"],
    seriousSideEffects: ["Serotonin syndrome (with other serotonergic drugs)", "Suicidal thoughts (especially in young adults — monitor closely)", "Hyponatremia (low sodium)", "Bleeding risk (with NSAIDs/anticoagulants)"],
    contraindications: ["Use with MAOIs (can cause serotonin syndrome)", "Use with pimozide", "Known allergy to SSRIs"],
    interactions: ["MAOIs (serotonin syndrome — contraindicated)", "Other SSRIs/SNRIs", "Triptans (serotonin syndrome risk)", "Tramadol", "St. John's Wort", "NSAIDs (bleeding risk)", "Warfarin (bleeding risk)"],
    typicalDosing: "Start: 25-50 mg once daily. Titrate to 50-200 mg/day. Take in morning or evening based on effect on sleep.",
    pregnancyCategory: "Category C — use only if benefit outweighs risk. Third trimester use may cause neonatal complications.",
    notes: "First-line treatment for depression and anxiety. Takes 4-6 weeks for full effect. Do not stop abruptly — taper to avoid discontinuation syndrome. Sexual side effects are common and may require dose adjustment or medication change.",
  },
  "omeprazole": {
    name: "Omeprazole (Prilosec)",
    genericName: "omeprazole",
    drugClass: "Proton Pump Inhibitor (PPI)",
    indications: ["GERD (acid reflux)", "Peptic ulcer disease", "H. pylori eradication (with antibiotics)", "Zollinger-Ellison syndrome", "Prevention of NSAID-induced ulcers"],
    mechanism: "Irreversibly inhibits the H+/K+ ATPase (proton pump) in gastric parietal cells, reducing gastric acid production by up to 99%.",
    commonSideEffects: ["Headache", "Diarrhea", "Abdominal pain", "Nausea"],
    seriousSideEffects: ["Increased risk of C. difficile infection", "Bone fractures (long-term use)", "Magnesium deficiency", "Vitamin B12 deficiency (long-term use)", "Increased risk of pneumonia", "Kidney disease (interstitial nephritis)"],
    contraindications: ["Known allergy to PPIs", "Use with rilpivirine"],
    interactions: ["Clopidogrel (may reduce effectiveness)", "Ketoconazole, itraconazole (reduced absorption)", "Methotrexate (increased levels)", "Rilpivirine (contraindicated)"],
    typicalDosing: "20-40 mg once daily, 30-60 minutes before breakfast. For H. pylori: 40 mg twice daily with antibiotics for 10-14 days.",
    pregnancyCategory: "Category C — use only if benefit outweighs risk",
    notes: "Most effective acid suppression medication. Should not be used long-term without medical supervision due to risks. Try to use lowest effective dose for shortest duration. Do not stop abruptly if used long-term — taper to avoid rebound acid hypersecretion.",
  },
  "albuterol": {
    name: "Albuterol (Ventolin, ProAir)",
    genericName: "albuterol",
    drugClass: "Short-acting Beta-2 Agonist (SABA)",
    indications: ["Asthma (rescue inhaler)", "COPD (rescue inhaler)", "Exercise-induced bronchospasm"],
    mechanism: "Beta-2 adrenergic agonist that relaxes bronchial smooth muscle, causing bronchodilation within minutes. Also inhibits mast cell mediator release.",
    commonSideEffects: ["Tremor/shakiness", "Rapid heartbeat (tachycardia)", "Nervousness", "Headache", "Throat irritation"],
    seriousSideEffects: ["Paradoxical bronchospasm (rare)", "Serious cardiovascular effects (rare — arrhythmia, hypertension)", "Hypokalemia (low potassium)"],
    contraindications: ["Known allergy to albuterol"],
    interactions: ["Beta-blockers (may antagonize bronchodilation)", "MAOIs and tricyclic antidepressants (cardiovascular effects)", "Diuretics (additive hypokalemia)"],
    typicalDosing: "Rescue: 1-2 inhalations every 4-6 hours as needed. Exercise-induced: 2 inhalations 15-30 minutes before exercise. Maximum: 12 inhalations/24 hours.",
    pregnancyCategory: "Generally considered safe in pregnancy (Category C — benefits usually outweigh risks)",
    notes: "This is a RESCUE inhaler for quick relief — not a controller medication. If using more than 2 times/week (excluding exercise), asthma may not be well controlled — see doctor. Always carry rescue inhaler. Use a spacer for better drug delivery.",
  },
  "warfarin": {
    name: "Warfarin (Coumadin)",
    genericName: "warfarin",
    drugClass: "Anticoagulant (Vitamin K Antagonist)",
    indications: ["Atrial fibrillation (stroke prevention)", "Deep vein thrombosis (DVT)", "Pulmonary embolism (PE)", "Mechanical heart valves", "Antiphospholipid syndrome"],
    mechanism: "Inhibits vitamin K-dependent synthesis of clotting factors II, VII, IX, and X, as well as proteins C and S. Reduces blood clotting ability.",
    commonSideEffects: ["Bleeding (most common — gums, nose, bruising)", "Gastrointestinal upset"],
    seriousSideEffects: ["Major bleeding (GI, intracranial)", "Skin necrosis (rare, early in treatment)", "Purple toe syndrome (rare)", "Teratogenic (birth defects)"],
    contraindications: ["Pregnancy", "Active bleeding", "Recent surgery", "Bleeding disorders", "Severe uncontrolled hypertension", "Liver disease with impaired synthesis", "Known allergy"],
    interactions: ["Vitamin K-rich foods (spinach, kale, broccoli — reduce effect)", "Many medications — CHECK ALL DRUGS", "NSAIDs and aspirin (increased bleeding)", "Antibiotics (may increase or decrease INR)", "Amiodarone (increases INR)", "St. John's Wort (decreases INR)", "Alcohol (variable effect)"],
    typicalDosing: "Variable — dosed by INR. Typical: 2-10 mg daily. Target INR: 2.0-3.0 for most indications, 2.5-3.5 for mechanical valves.",
    pregnancyCategory: "Contraindicated in pregnancy (Category X — causes birth defects)",
    notes: "Requires regular INR monitoring (weekly to monthly). Dietary vitamin K intake should be consistent, not eliminated. Many drug interactions — always check before starting any new medication. Being replaced by DOACs (direct oral anticoagulants) for many indications due to easier monitoring.",
  },
};

export const medicalDrug: ToolDef = {
  name: "medical.drug",
  description: "Look up medication information including drug class, indications, mechanism of action, side effects, contraindications, drug interactions, typical dosing, and pregnancy category. Use this to provide pharmaceutical information. Available drugs: acetaminophen, ibuprofen, amoxicillin, metformin, lisinopril, atorvastatin, sertraline, omeprazole, albuterol, warfarin. Use 'list' to see all available drugs.",
  inputSchema: z.object({
    drug: z.string().describe("Drug name (generic or brand) or 'list' to see all available drugs"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    drug_info: z.object({
      name: z.string(),
      generic_name: z.string(),
      drug_class: z.string(),
      indications: z.array(z.string()),
      mechanism: z.string(),
      common_side_effects: z.array(z.string()),
      serious_side_effects: z.array(z.string()),
      contraindications: z.array(z.string()),
      interactions: z.array(z.string()),
      typical_dosing: z.string(),
      pregnancy_category: z.string(),
      notes: z.string(),
    }).optional(),
    available_drugs: z.array(z.string()).optional(),
    disclaimer: z.string(),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ drug }) {
    const disclaimer = "MEDICAL DISCLAIMER: This information is for educational purposes only. Always consult a healthcare provider or pharmacist before starting, stopping, or changing any medication. Drug interactions and individual factors may affect safety and efficacy.";

    if (drug === "list") {
      const available = Object.keys(DRUGS).map((k) => `${DRUGS[k]!.name} (${k})`);
      return { success: true, available_drugs: available, disclaimer, message: `Available drugs: ${available.join(", ")}` };
    }

    const drugKey = drug.toLowerCase().trim();
    const info = DRUGS[drugKey];
    if (!info) {
      // Try to match brand name
      for (const [key, value] of Object.entries(DRUGS)) {
        if (value.name.toLowerCase().includes(drugKey)) {
          return {
            success: true,
            drug_info: {
              name: value.name,
              generic_name: value.genericName,
              drug_class: value.drugClass,
              indications: value.indications,
              mechanism: value.mechanism,
              common_side_effects: value.commonSideEffects,
              serious_side_effects: value.seriousSideEffects,
              contraindications: value.contraindications,
              interactions: value.interactions,
              typical_dosing: value.typicalDosing,
              pregnancy_category: value.pregnancyCategory,
              notes: value.notes,
            },
            disclaimer,
            message: `Drug information for ${value.name}`,
          };
        }
      }
      return {
        success: false,
        disclaimer,
        message: `Drug '${drug}' not found. Use 'list' to see available drugs.`,
      };
    }

    return {
      success: true,
      drug_info: {
        name: info.name,
        generic_name: info.genericName,
        drug_class: info.drugClass,
        indications: info.indications,
        mechanism: info.mechanism,
        common_side_effects: info.commonSideEffects,
        serious_side_effects: info.seriousSideEffects,
        contraindications: info.contraindications,
        interactions: info.interactions,
        typical_dosing: info.typicalDosing,
        pregnancy_category: info.pregnancyCategory,
        notes: info.notes,
      },
      disclaimer,
      message: `Drug information for ${info.name}`,
    };
  },
};

// =============================================================================
// HUMAN ANATOMY — body systems, organs, structures
// =============================================================================

interface OrganInfo {
  name: string;
  system: string;
  location: string;
  function: string;
  relatedConditions: string[];
  clinicalNotes: string;
}

const ANATOMY: Record<string, OrganInfo> = {
  "heart": {
    name: "Heart",
    system: "Cardiovascular",
    location: "Mediastinum, left of center, behind sternum. Base at 2nd intercostal space, apex at 5th intercostal space midclavicular line.",
    function: "Pumps blood throughout the body. Right side receives deoxygenated blood from body and pumps to lungs. Left side receives oxygenated blood from lungs and pumps to body. Four chambers: right/left atria and right/left ventricles. Valves: tricuspid, pulmonary, mitral, aortic.",
    relatedConditions: ["Coronary artery disease", "Heart attack (myocardial infarction)", "Heart failure", "Arrhythmias", "Valvular heart disease", "Cardiomyopathy", "Endocarditis"],
    clinicalNotes: "Auscultate at: aortic (2nd right ICS), pulmonic (2nd left ICS), tricuspid (4th left ICS), mitral (5th left ICS midclavicular). Normal heart rate: 60-100 bpm. Coronary arteries: LAD, RCA, LCX.",
  },
  "brain": {
    name: "Brain",
    system: "Nervous",
    location: "Cranial cavity, protected by skull and meninges (dura, arachnoid, pia mater).",
    function: "Central nervous system control center. Cerebrum: higher functions (thinking, movement, senses). Cerebellum: balance, coordination. Brainstem: vital functions (breathing, heart rate, consciousness). Basal ganglia: movement control. Limbic system: emotions, memory.",
    relatedConditions: ["Stroke (ischemic/hemorrhagic)", "TIA", "Brain tumor", "Meningitis", "Encephalitis", "Epilepsy", "Alzheimer's disease", "Parkinson's disease", "Concussion/TBI", "Aneurysm"],
    clinicalNotes: "Lobes: frontal (personality, motor), parietal (sensation), temporal (memory, hearing), occipital (vision). Circle of Willis provides collateral circulation. Glasgow Coma Scale assesses consciousness.",
  },
  "lungs": {
    name: "Lungs",
    system: "Respiratory",
    location: "Thoracic cavity, flanking the heart. Right lung: 3 lobes (upper, middle, lower). Left lung: 2 lobes (upper, lower) with cardiac notch for heart.",
    function: "Gas exchange: oxygen in, carbon dioxide out. Air travels: nose/mouth to pharynx to larynx to trachea to bronchi to bronchioles to alveoli. Alveoli are where gas exchange occurs with pulmonary capillaries.",
    relatedConditions: ["Pneumonia", "Asthma", "COPD", "Lung cancer", "Pulmonary embolism", "Pneumothorax", "Pulmonary edema", "Tuberculosis", "Pulmonary fibrosis", "ARDS"],
    clinicalNotes: "Auscultate 6 areas on each side. Normal breath sounds: vesicular (peripheral), bronchovesicular (central), bronchial (over trachea). Adventitious sounds: crackles, wheezes, rhonchi, friction rub. SpO2 normal: 95-100%.",
  },
  "liver": {
    name: "Liver",
    system: "Digestive/Hepatobiliary",
    location: "Right upper quadrant of abdomen, below diaphragm. Largest internal organ.",
    function: "Metabolic center: detoxification, protein synthesis (albumin, clotting factors), bile production, glycogen storage, cholesterol synthesis, drug metabolism (cytochrome P450). Stores vitamins A, D, B12, K, iron.",
    relatedConditions: ["Hepatitis (A, B, C)", "Cirrhosis", "Fatty liver disease (NAFLD)", "Liver cancer (hepatocellular carcinoma)", "Hemochromatosis", "Liver failure", "Portal hypertension", "Ascites"],
    clinicalNotes: "Liver function tests: ALT, AST, ALP, GGT, bilirubin, albumin, PT/INR. ALT more specific for liver than AST. AST/ALT ratio >2 suggests alcoholic liver disease. Check for jaundice, hepatomegaly, spider angiomas, palmar erythema.",
  },
  "kidneys": {
    name: "Kidneys",
    system: "Urinary",
    location: "Retroperitoneal, posterior abdominal wall. Right kidney slightly lower (liver pushes it down). T12-L3 vertebral levels.",
    function: "Filter blood to produce urine. Regulate: fluid/electrolyte balance, acid-base balance, blood pressure (renin-angiotensin system), red blood cell production (erythropoietin), bone health (activate vitamin D). Nephron is functional unit (~1 million per kidney).",
    relatedConditions: ["Chronic kidney disease (CKD)", "Acute kidney injury (AKI)", "Kidney stones", "Urinary tract infection", "Glomerulonephritis", "Polycystic kidney disease", "Kidney cancer", "Nephrotic syndrome", "Diabetic nephropathy"],
    clinicalNotes: "Kidney function: eGFR, creatinine, BUN, urinalysis. eGFR >90 normal, 60-89 mild, 30-59 moderate, 15-29 severe, <15 kidney failure. Proteinuria indicates kidney damage. Hematuria may indicate stones, infection, or cancer.",
  },
  "stomach": {
    name: "Stomach",
    system: "Digestive",
    location: "Left upper quadrant of abdomen, below diaphragm. J-shaped organ connecting esophagus to duodenum.",
    function: "Food storage, mechanical and chemical digestion. Produces gastric acid (HCl, pH 1.5-3.5), pepsin (protein digestion), intrinsic factor (B12 absorption). Mucosal barrier protects from acid damage.",
    relatedConditions: ["Gastritis", "Peptic ulcer disease", "GERD", "Stomach cancer (gastric adenocarcinoma)", "Gastroparesis", "H. pylori infection", "Zollinger-Ellison syndrome"],
    clinicalNotes: "H. pylori is major cause of ulcers: test and treat. PPIs reduce acid production. Gastroscopy for diagnosis. Alarm features: weight loss, dysphagia, vomiting, bleeding, family history of gastric cancer.",
  },
  "pancreas": {
    name: "Pancreas",
    system: "Digestive/Endocrine",
    location: "Retroperitoneal, behind stomach. Head in C-loop of duodenum, tail near spleen.",
    function: "Dual function: Exocrine produces digestive enzymes (amylase, lipase, proteases) delivered via pancreatic duct to duodenum. Endocrine islets of Langerhans produce insulin (beta cells), glucagon (alpha cells), somatostatin (delta cells).",
    relatedConditions: ["Pancreatitis (acute/chronic)", "Pancreatic cancer", "Diabetes mellitus (Type 1 and 2)", "Pancreatic insufficiency", "Pancreatic pseudocyst", "Insulinoma"],
    clinicalNotes: "Lipase more specific than amylase for pancreatitis. Pancreatic cancer has poor prognosis, often late presentation. Type 1 diabetes: autoimmune beta cell destruction. Type 2: insulin resistance with relative insulin deficiency.",
  },
  "thyroid": {
    name: "Thyroid Gland",
    system: "Endocrine",
    location: "Anterior neck, below larynx, straddling trachea. Butterfly-shaped with two lobes connected by isthmus.",
    function: "Produces thyroid hormones (T3, T4) that regulate metabolism, growth, development, and body temperature. Also produces calcitonin (calcium regulation). Controlled by TSH from pituitary. Requires iodine for hormone synthesis.",
    relatedConditions: ["Hypothyroidism (Hashimoto's thyroiditis)", "Hyperthyroidism (Graves' disease)", "Thyroid nodules", "Thyroid cancer (papillary, follicular)", "Goiter", "Thyroiditis", "Thyroid storm"],
    clinicalNotes: "TSH is best screening test. High TSH = hypothyroidism. Low TSH = hyperthyroidism. Free T4 confirms. Hashimoto's: anti-TPO antibodies. Graves: TSI antibodies, exophthalmos. Thyroid ultrasound for nodules. FNA if suspicious.",
  },
  "spine": {
    name: "Spine (Vertebral Column)",
    system: "Musculoskeletal/Nervous",
    location: "Posterior midline from skull to pelvis. 33 vertebrae: 7 cervical, 12 thoracic, 5 lumbar, 5 sacral (fused), 4 coccygeal (fused).",
    function: "Structural support, protection of spinal cord, attachment for muscles, allows movement and flexibility. Intervertebral discs provide shock absorption. Spinal cord travels through vertebral canal, nerve roots exit through intervertebral foramina.",
    relatedConditions: ["Herniated disc", "Spinal stenosis", "Scoliosis", "Osteoporotic compression fracture", "Spondylolisthesis", "Spinal cord injury", "Cauda equina syndrome", "Ankylosing spondylitis", "Sciatica"],
    clinicalNotes: "Cauda equina syndrome: emergency with saddle anesthesia, bladder/bowel dysfunction. Spinal cord injury: immobilize immediately. Dermatomes map sensory levels. Myotomes map motor levels. MRI best for soft tissue, CT for bone.",
  },
  "skin": {
    name: "Skin (Integumentary System)",
    system: "Integumentary",
    location: "Covers entire body surface. Largest organ. Three layers: epidermis (outer), dermis (middle), hypodermis/subcutis (inner).",
    function: "Protection (barrier against pathogens, UV, chemicals), temperature regulation (sweating, vasodilation/vasoconstriction), sensation (touch, pressure, pain, temperature), vitamin D synthesis, immune surveillance.",
    relatedConditions: ["Eczema", "Psoriasis", "Skin cancer (melanoma, BCC, SCC)", "Cellulitis", "Shingles", "Contact dermatitis", "Acne", "Rosacea", "Burns", "Scleroderma"],
    clinicalNotes: "ABCDE for melanoma: Asymmetry, Border irregular, Color varied, Diameter >6mm, Evolving. Skin biopsy for diagnosis. Wood's lamp for fungal infections. Check entire skin surface during full body exam.",
  },
};

export const medicalAnatomy: ToolDef = {
  name: "medical.anatomy",
  description: "Look up human anatomy information: organs, body systems, locations, functions, related conditions, and clinical notes. Use this to provide anatomical context when discussing medical conditions. Available: heart, brain, lungs, liver, kidneys, stomach, pancreas, thyroid, spine, skin. Use 'list' to see all.",
  inputSchema: z.object({
    organ: z.string().describe("Organ or body part name, or 'list' to see all available"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    anatomy_info: z.object({
      name: z.string(),
      system: z.string(),
      location: z.string(),
      function: z.string(),
      related_conditions: z.array(z.string()),
      clinical_notes: z.string(),
    }).optional(),
    available: z.array(z.string()).optional(),
    disclaimer: z.string(),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ organ }) {
    const disclaimer = "MEDICAL DISCLAIMER: This information is for educational purposes only and is not a substitute for professional medical advice.";

    if (organ === "list") {
      const available = Object.entries(ANATOMY).map(([k, v]) => `${v.name} (${k})`);
      return { success: true, available, disclaimer, message: `Available: ${available.join(", ")}` };
    }

    const key = organ.toLowerCase().trim();
    const info = ANATOMY[key];
    if (!info) {
      return { success: false, disclaimer, message: `Organ '${organ}' not found. Use 'list' to see available.` };
    }

    return {
      success: true,
      anatomy_info: {
        name: info.name,
        system: info.system,
        location: info.location,
        function: info.function,
        related_conditions: info.relatedConditions,
        clinical_notes: info.clinicalNotes,
      },
      disclaimer,
      message: `Anatomy information for ${info.name}`,
    };
  },
};

// =============================================================================
// LAB INTERPRETATION — interpret lab results
// =============================================================================

interface LabTestInfo {
  name: string;
  category: string;
  normalRange: string;
  units: string;
  lowCauses: string[];
  highCauses: string[];
  clinicalNotes: string;
}

const LAB_TESTS: Record<string, LabTestInfo> = {
  "cbc": {
    name: "Complete Blood Count (CBC)",
    category: "Hematology",
    normalRange: "WBC: 4.5-11.0, RBC: 4.1-5.1 (M) / 3.8-4.8 (F), Hgb: 13.5-17.5 (M) / 12.0-15.5 (F), Hct: 41-53% (M) / 36-46% (F), Plt: 150-450",
    units: "WBC: x10^3/uL, RBC: x10^6/uL, Hgb: g/dL, Hct: %, Plt: x10^3/uL",
    lowCauses: ["WBC low: viral infection, autoimmune disease, bone marrow disorder, chemotherapy", "RBC/Hgb/Hct low: anemia (iron deficiency, bleeding, chronic disease, B12/folate deficiency)", "Plt low: ITP, DIC, leukemia, sepsis, medications"],
    highCauses: ["WBC high: bacterial infection, inflammation, leukemia, stress, steroids", "RBC/Hgb/Hct high: polycythemia, dehydration, high altitude, smoking, COPD", "Plt high: reactive (infection, inflammation), essential thrombocythemia, iron deficiency"],
    clinicalNotes: "Most commonly ordered lab test. Always interpret in clinical context. MCV helps classify anemia: <80 microcytic (iron deficiency), 80-100 normocytic, >100 macrocytic (B12/folate). RDW assesses anisocytosis.",
  },
  "bmp": {
    name: "Basic Metabolic Panel (BMP)",
    category: "Chemistry",
    normalRange: "Na: 135-145, K: 3.5-5.0, Cl: 98-107, CO2: 22-29, BUN: 7-20, Cr: 0.6-1.2 (M) / 0.5-1.1 (F), Glucose: 70-100 (fasting)",
    units: "Na/K/Cl/CO2: mmol/L, BUN/Cr/Glucose: mg/dL",
    lowCauses: ["Na low: hyponatremia (SIADH, heart failure, diuretics, vomiting/diarrhea)", "K low: diuretics, vomiting/diarrhea, low intake", "Glucose low: hypoglycemia (insulin, fasting, sepsis)"],
    highCauses: ["Na high: dehydration, diabetes insipidus, high salt intake", "K high: kidney disease, ACE inhibitors, Addison's disease, hemolysis", "BUN high: kidney disease, dehydration, GI bleeding, high protein", "Cr high: kidney disease, muscle breakdown, some medications", "Glucose high: diabetes, stress, steroids, Cushing's"],
    clinicalNotes: "eGFR calculated from creatinine, age, sex. BUN/Cr ratio >20 suggests dehydration or GI bleed. Glucose >200 suggests diabetes. Always check fasting vs random glucose. HbA1c for long-term glucose control.",
  },
  "lipid_panel": {
    name: "Lipid Panel",
    category: "Chemistry",
    normalRange: "Total chol: <200, LDL: <100 (optimal), HDL: >40 (M) / >50 (F), Triglycerides: <150",
    units: "mg/dL",
    lowCauses: ["HDL low: metabolic syndrome, sedentary lifestyle, smoking, high carbs", "Total chol low: malnutrition, liver disease, hyperthyroidism, anemia"],
    highCauses: ["LDL high: diet (saturated fat), genetics (familial hypercholesterolemia), hypothyroidism", "Triglycerides high: obesity, diabetes, alcohol, medications", "Total chol high: diet, genetics, hypothyroidism, pregnancy"],
    clinicalNotes: "LDL is primary target for cardiovascular risk reduction. Non-HDL = total - HDL. Triglycerides >500 risk for pancreatitis. Fast 9-12 hours for accurate triglycerides. Statins are first-line for high LDL.",
  },
  "lft": {
    name: "Liver Function Tests (LFTs)",
    category: "Chemistry",
    normalRange: "ALT: 7-56, AST: 10-40, ALP: 44-147, GGT: 8-61, Bilirubin total: 0.1-1.2, Albumin: 3.5-5.0",
    units: "ALT/AST/ALP/GGT: U/L, Bilirubin: mg/dL, Albumin: g/dL",
    lowCauses: ["Albumin low: liver disease, nephrotic syndrome, malnutrition, inflammation", "ALP low: hypothyroidism, pernicious anemia, zinc deficiency"],
    highCauses: ["ALT/AST high: hepatitis, fatty liver, drug toxicity, alcohol", "ALP high: biliary obstruction, bone disease, pregnancy, liver disease", "GGT high: alcohol use, biliary disease, fatty liver", "Bilirubin high: liver disease, hemolysis, biliary obstruction, Gilbert's syndrome"],
    clinicalNotes: "ALT more liver-specific than AST. AST/ALT ratio >2: alcoholic liver disease. AST/ALT <1: viral hepatitis or fatty liver. ALP + GGT high = liver origin. ALP high + GGT normal = bone origin. Direct vs indirect bilirubin helps differentiate causes.",
  },
  "tsh": {
    name: "Thyroid Stimulating Hormone (TSH)",
    category: "Endocrine",
    normalRange: "0.4-4.0",
    units: "mIU/L",
    lowCauses: ["TSH low: hyperthyroidism (Graves' disease, toxic nodule, thyroiditis, excessive thyroid hormone replacement)"],
    highCauses: ["TSH high: hypothyroidism (Hashimoto's thyroiditis, iodine deficiency, post-thyroiditis, pituitary tumor)"],
    clinicalNotes: "Best single test for thyroid screening. Check free T4 to confirm. Subclinical hypothyroidism: high TSH, normal T4. Subclinical hyperthyroidism: low TSH, normal T4. Pregnancy changes normal ranges. Check TSH in patients with fatigue, weight changes, temperature intolerance.",
  },
  "hba1c": {
    name: "Hemoglobin A1c (HbA1c)",
    category: "Endocrine",
    normalRange: "<5.7% normal, 5.7-6.4% prediabetes, >=6.5% diabetes",
    units: "%",
    lowCauses: ["HbA1c low: hemolytic anemia, recent blood loss, pregnancy, chronic kidney disease (false low)"],
    highCauses: ["HbA1c high: diabetes mellitus, poor glucose control, iron deficiency anemia (false high), chronic kidney disease"],
    clinicalNotes: "Reflects average blood glucose over past 2-3 months. Does not require fasting. Goal for most diabetics: <7%. More stringent (<6.5%) for some, less stringent (<8%) for elderly/comorbidities. May be inaccurate with hemoglobinopathies or conditions affecting RBC lifespan.",
  },
  "inr": {
    name: "International Normalized Ratio (INR)",
    category: "Coagulation",
    normalRange: "0.8-1.2 (not on anticoagulants), 2.0-3.0 (most indications), 2.5-3.5 (mechanical valves)",
    units: "ratio",
    lowCauses: ["INR low (below target): inadequate warfarin dose, vitamin K intake, medication interactions, non-adherence"],
    highCauses: ["INR high (above target): excessive warfarin dose, drug interactions, liver disease, vitamin K deficiency, malnutrition, alcohol"],
    clinicalNotes: "INR >5: hold warfarin, consider vitamin K. INR >9 with bleeding: vitamin K + fresh frozen plasma. Many drug interactions. Dietary vitamin K should be consistent, not eliminated. Being replaced by DOACs for many indications.",
  },
  "crp": {
    name: "C-Reactive Protein (CRP)",
    category: "Inflammation",
    normalRange: "<3.0 (standard), <1.0 (cardiac risk: low <1, moderate 1-3, high >3)",
    units: "mg/L",
    lowCauses: ["CRP low: no significant inflammation or infection"],
    highCauses: ["CRP high: bacterial infection, inflammation, autoimmune disease (RA, lupus), tissue injury, myocardial infarction, malignancy", "hs-CRP high: increased cardiovascular risk"],
    clinicalNotes: "Non-specific marker of inflammation. More sensitive than ESR, rises and falls faster. hs-CRP used for cardiovascular risk assessment. CRP >100 usually indicates bacterial infection. Serial measurements track disease activity.",
  },
  "d_dimer": {
    name: "D-Dimer",
    category: "Coagulation",
    normalRange: "<0.5 (varies by lab and age: age x 0.01 for >50 years)",
    units: "ug/mL FEU",
    lowCauses: ["D-Dimer low: helps RULE OUT venous thromboembolism (DVT/PE) if pre-test probability is low"],
    highCauses: ["D-Dimer high: DVT, PE, DIC, recent surgery, trauma, infection, malignancy, pregnancy, aortic dissection", "Non-specific: many causes of elevation"],
    clinicalNotes: "High sensitivity but LOW specificity for VTE. Used to RULE OUT, not rule in. If Wells score is low and D-dimer is negative, PE/DVT is effectively excluded. If D-dimer is high, need imaging (CTPA, ultrasound). False positives common in elderly, hospitalized, and pregnant patients.",
  },
  "troponin": {
    name: "Troponin (I or T)",
    category: "Cardiac",
    normalRange: "<0.04 (varies by assay: check lab-specific reference)",
    units: "ng/mL",
    lowCauses: ["Troponin low/normal: no myocardial injury"],
    highCauses: ["Troponin high: myocardial infarction (heart attack), myocarditis, heart failure, PE, sepsis, kidney disease, cardiac contusion, strenuous exercise"],
    clinicalNotes: "Most specific marker for myocardial injury. Rise within 3-6 hours, peak at 24 hours, remain elevated for 7-10 days. Serial troponins at 0, 3, 6 hours. High-sensitivity troponin (hs-cTn) detects smaller changes. Pattern of rise and fall helps distinguish MI from other causes.",
  },
};

export const medicalLab: ToolDef = {
  name: "medical.lab",
  description: "Interpret laboratory test results. Provides normal ranges, causes of abnormal values (high/low), and clinical notes. Available tests: CBC, BMP, lipid_panel, LFT, TSH, HbA1c, INR, CRP, D-dimer, troponin. Use 'list' to see all. Provide the test name and optionally the patient's value for interpretation.",
  inputSchema: z.object({
    test: z.string().describe("Lab test name (e.g. 'cbc', 'bmp', 'tsh', 'hba1c') or 'list'"),
    patient_value: z.string().optional().describe("Patient's result value (e.g. 'WBC 14.5, Hgb 9.2') for interpretation"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    lab_info: z.object({
      name: z.string(),
      category: z.string(),
      normal_range: z.string(),
      units: z.string(),
      low_causes: z.array(z.string()),
      high_causes: z.array(z.string()),
      clinical_notes: z.string(),
    }).optional(),
    interpretation: z.string().optional(),
    available: z.array(z.string()).optional(),
    disclaimer: z.string(),
    message: z.string(),
  }) as any,
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ test, patient_value }) {
    const disclaimer = "MEDICAL DISCLAIMER: Lab interpretation is for educational purposes only. Always consult a healthcare provider for proper interpretation of lab results in clinical context.";

    if (test === "list") {
      const available = Object.entries(LAB_TESTS).map(([k, v]) => `${v.name} (${k})`);
      return { success: true, available, disclaimer, message: `Available tests: ${available.join(", ")}` };
    }

    const key = test.toLowerCase().trim();
    const info = LAB_TESTS[key];
    if (!info) {
      return { success: false, disclaimer, message: `Test '${test}' not found. Use 'list' to see available.` };
    }

    let interpretation: string | undefined;
    if (patient_value) {
      interpretation = `Patient value: ${patient_value}\nNormal range: ${info.normalRange} ${info.units}\n\nCompare the patient's value to the normal range. Values above the range may indicate: ${info.highCauses.join("; ")}. Values below the range may indicate: ${info.lowCauses.join("; ")}.\n\n${info.clinicalNotes}`;
    }

    return {
      success: true,
      lab_info: {
        name: info.name,
        category: info.category,
        normal_range: info.normalRange,
        units: info.units,
        low_causes: info.lowCauses,
        high_causes: info.highCauses,
        clinical_notes: info.clinicalNotes,
      },
      interpretation,
      disclaimer,
      message: `Lab information for ${info.name}`,
    };
  },
};
