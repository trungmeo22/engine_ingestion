import logging
import re
from typing import List, Optional, Tuple

from config import settings
from schemas.document import (
    DocumentMetadata,
    DocumentRecord,
    DocumentType,
)

logger = logging.getLogger("medical_engine.document_classifier")


class DocumentClassifier:
    """Two-tier medical document classifier.

    Tier 1: High-precision deterministic signal matching.
    Tier 2: LLM fallback (when confidence < threshold and enabled).
    """

    # Medical organizations mapping
    ORGANIZATIONS = {
        "ESC": ["ESC", "European Society of Cardiology"],
        "AHA": ["AHA", "American Heart Association"],
        "ACC": ["ACC", "American College of Cardiology"],
        "NICE": ["NICE", "National Institute for Health and Care Excellence"],
        "WHO": ["WHO", "World Health Organization"],
        "ADA": ["ADA", "American Diabetes Association"],
        "KDIGO": ["KDIGO", "Kidney Disease: Improving Global Outcomes"],
        "IDSA": ["IDSA", "Infectious Diseases Society of America"],
        "ATS": ["ATS", "American Thoracic Society"],
        "ERS": ["ERS", "European Respiratory Society"],
        "ASCO": ["ASCO", "American Society of Clinical Oncology"],
        "ESMO": ["ESMO", "European Society for Medical Oncology"],
        "AAN": ["AAN", "American Academy of Neurology"],
        "EAN": ["EAN", "European Academy of Neurology"],
        "AASLD": ["AASLD", "American Association for the Study of Liver Diseases"],
        "EASL": ["EASL", "European Association for the Study of the Liver"],
    }

    # Medical specialties mapping
    SPECIALTIES = {
        "cardiology": [
            "cardiology", "cardiac", "heart failure", "myocardial", "arrhythmia",
            "atrial fibrillation", "coronary", "hypertension", "valvular", "stemi",
            "nstemi", "cardiomyopathy", "ejection fraction", "lvef", "bnp", "dapa-hf", "emperor-reduced"
        ],
        "endocrinology": [
            "diabetes", "endocrinology", "glycemic", "insulin", "hba1c", "thyroid",
            "metabolic", "adrenal", "pituitary", "sglt2", "glp-1"
        ],
        "nephrology": [
            "nephrology", "kidney", "renal", "egfr", "albuminuria", "ckd",
            "dialysis", "glomerulonephritis"
        ],
        "pulmonology": [
            "pulmonology", "respiratory", "asthma", "copd", "pneumonia", "pulmonary",
            "bronchitis", "ards", "fev1"
        ],
        "neurology": [
            "neurology", "stroke", "epilepsy", "seizure", "alzheimer", "parkinson",
            "multiple sclerosis", "neuropathy", "headache", "migraine"
        ],
        "oncology": [
            "oncology", "cancer", "carcinoma", "tumor", "neoplasm", "chemotherapy",
            "immunotherapy", "metastasis", "lymphoma", "leukemia"
        ],
        "infectious_disease": [
            "infectious disease", "infection", "antimicrobial", "antibiotic", "hiv",
            "covid-19", "sars-cov-2", "tuberculosis", "sepsis", "bacterial", "viral"
        ],
        "gastroenterology": [
            "gastroenterology", "hepatology", "cirrhosis", "hepatitis", "crohn",
            "ulcerative colitis", "ibd", "gerd", "peptic ulcer"
        ],
    }

    # Topics mapping
    TOPIC_KEYWORDS = {
        "heart failure": ["heart failure", "hfref", "hfpef", "hfmrfe", "nyha", "dapa-hf", "emperor-reduced"],
        "atrial fibrillation": ["atrial fibrillation", "afib", "cha2ds2-vasc", "anticoagulation"],
        "hypertension": ["hypertension", "blood pressure", "antihypertensive"],
        "type 2 diabetes": ["type 2 diabetes", "t2d", "t2dm", "hyperglycemia", "sglt2"],
        "chronic kidney disease": ["chronic kidney disease", "ckd", "kidney failure", "egfr"],
        "copd": ["copd", "chronic obstructive pulmonary", "emphysema"],
        "asthma": ["asthma", "bronchospasm", "inhaled corticosteroid"],
        "acute coronary syndrome": ["acute coronary syndrome", "acs", "stemi", "nstemi", "myocardial infarction"],
        "stroke": ["stroke", "ischemic stroke", "intracerebral hemorrhage", "thrombolysis", "thrombectomy"],
        "sepsis": ["sepsis", "septic shock", "sofa score", "surviving sepsis"],
    }

    def __init__(self, confidence_threshold: Optional[float] = None):
        self.confidence_threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else settings.classification_confidence_threshold
        )

    def classify(
        self,
        document_record: DocumentRecord,
        first_page_text: str = "",
        headings: Optional[List[str]] = None,
    ) -> DocumentMetadata:
        """Executes two-tier classification pipeline on the document."""
        logger.info(f"[{document_record.document_id}][classify] Starting classification for '{document_record.file_name}'")

        # Tier 1: Deterministic rule-based
        metadata = self._classify_deterministic(
            file_name=document_record.file_name,
            title_hint=document_record.title,
            first_page_text=first_page_text,
            headings=headings or [],
        )

        # Confidence check
        if metadata.confidence < self.confidence_threshold:
            metadata.needs_llm_classification = True
            logger.info(
                f"[{document_record.document_id}][classify] Low confidence ({metadata.confidence:.2f} < {self.confidence_threshold:.2f}). Marked needs_llm_classification=True"
            )
            # Tier 2 LLM fallback hook
            if settings.enable_llm_classification_fallback:
                metadata = self._classify_with_llm(document_record, metadata, first_page_text)
        else:
            metadata.needs_llm_classification = False
            logger.info(
                f"[{document_record.document_id}][classify] High confidence ({metadata.confidence:.2f}). Identified type={metadata.document_type.value}, org={metadata.organization}, spec={metadata.specialty}"
            )

        return metadata

    def _classify_deterministic(
        self,
        file_name: str,
        title_hint: Optional[str] = None,
        first_page_text: str = "",
        headings: Optional[List[str]] = None,
    ) -> DocumentMetadata:
        headings = headings or []
        corpus = f"{file_name} {title_hint or ''} {' '.join(headings[:10])} {first_page_text[:4000]}".lower()
        
        signals: List[str] = []
        doc_type = DocumentType.unknown
        confidence = 0.40  # base confidence

        # 1. Document Type Detection (Prioritize specific study designs)
        if "meta-analysis" in corpus or "meta analysis" in corpus:
            doc_type = DocumentType.meta_analysis
            signals.append("keyword:meta_analysis")
            confidence += 0.40
        elif "systematic review" in corpus or "cochrane" in corpus:
            doc_type = DocumentType.systematic_review
            signals.append("keyword:systematic_review")
            confidence += 0.40
        elif any(term in corpus for term in ["randomized controlled trial", "randomised controlled trial", "rct", "double-blind, placebo-controlled", "trial investigators"]):
            doc_type = DocumentType.RCT
            signals.append("keyword:rct")
            confidence += 0.35
        elif any(term in corpus for term in ["guideline", "guidelines", "clinical practice guideline", "esc guidelines", "aha guidelines"]):
            doc_type = DocumentType.guideline
            signals.append("keyword:guideline")
            confidence += 0.35
        elif "consensus" in corpus or "expert consensus" in corpus:
            doc_type = DocumentType.consensus
            signals.append("keyword:consensus")
            confidence += 0.30
        elif "study protocol" in corpus or "trial protocol" in corpus or "protocol for a" in corpus:
            doc_type = DocumentType.protocol
            signals.append("keyword:protocol")
            confidence += 0.30
        elif "narrative review" in corpus or "state-of-the-art review" in corpus or "clinical review" in corpus:
            doc_type = DocumentType.review
            signals.append("keyword:review")
            confidence += 0.25
        elif "textbook" in corpus or "handbook of" in corpus or "principles of internal medicine" in corpus:
            doc_type = DocumentType.textbook
            signals.append("keyword:textbook")
            confidence += 0.25

        # 2. Organization Detection
        detected_org = None
        for org_code, aliases in self.ORGANIZATIONS.items():
            for alias in aliases:
                # Word boundary match for short acronyms like ESC, AHA
                pattern = rf"\b{re.escape(alias.lower())}\b"
                if re.search(pattern, corpus):
                    detected_org = org_code
                    signals.append(f"org:{org_code}")
                    confidence += 0.15
                    break
            if detected_org:
                break

        # 3. Specialty Detection
        detected_specialty = None
        best_spec_count = 0
        for spec, keywords in self.SPECIALTIES.items():
            matches = sum(1 for kw in keywords if re.search(rf"\b{re.escape(kw)}\b", corpus))
            if matches > best_spec_count:
                best_spec_count = matches
                detected_specialty = spec

        if detected_specialty and best_spec_count > 0:
            signals.append(f"specialty:{detected_specialty}(matches={best_spec_count})")
            confidence += min(0.20, best_spec_count * 0.05)

        # 4. Topics Detection
        matched_topics: List[str] = []
        for topic_name, keywords in self.TOPIC_KEYWORDS.items():
            if any(re.search(rf"\b{re.escape(kw)}\b", corpus) for kw in keywords):
                matched_topics.append(topic_name)
                signals.append(f"topic:{topic_name}")

        # 5. Publication Year Detection
        year_match = re.search(r"\b(20[0-2][0-9]|199[0-9])\b", corpus)
        pub_year = int(year_match.group(1)) if year_match else None
        if pub_year:
            signals.append(f"year:{pub_year}")

        # 6. Title Extraction
        clean_title = title_hint or ""
        if not clean_title or clean_title.lower() == "untitled":
            # Extract from first page or filename
            lines = [l.strip() for l in first_page_text.split("\n") if len(l.strip()) > 10]
            clean_title = lines[0] if lines else Path(file_name).stem.replace("_", " ")

        confidence = max(0.10, min(0.99, confidence))

        return DocumentMetadata(
            title=clean_title,
            authors=[],
            organization=detected_org,
            publication_year=pub_year,
            version=None,
            language="en",
            specialty=detected_specialty,
            topics=matched_topics,
            document_type=doc_type,
            confidence=round(confidence, 2),
            needs_llm_classification=confidence < self.confidence_threshold,
            evidence_signals=signals,
        )

    def _classify_with_llm(
        self,
        document_record: DocumentRecord,
        current_meta: DocumentMetadata,
        first_page_text: str,
    ) -> DocumentMetadata:
        """Tier 2 fallback: placeholder hook ready for LLM integration when enabled."""
        logger.info(f"[{document_record.document_id}][classify_llm] Tier-2 LLM hook triggered")
        # In this phase, we maintain deterministic accuracy and preserve signals
        return current_meta
