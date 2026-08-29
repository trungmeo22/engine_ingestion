import os
import sys
from pathlib import Path

# Setup paths
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pypdf import PageObject, PdfWriter


def create_sample_files():
    input_dir = Path("input")
    input_dir.mkdir(parents=True, exist_ok=True)

    # 1. ESC Guidelines for Heart Failure 2023 (TXT format)
    esc_hf_txt = input_dir / "ESC_Guidelines_for_the_Management_of_Heart_Failure_2023.txt"
    esc_hf_txt.write_text(
        """2023 ESC Guidelines for the management of acute and chronic heart failure.
Developed by the task force for the diagnosis and treatment of acute and chronic heart failure of the European Society of Cardiology (ESC).
Authors/Task Force Members: Theresa A. McDonagh, Marco Metra, Marianna Adamo, Roy S. Gardner, et al.
European Heart Journal (2023) 44, 3627–3739.

1. Preamble and Introduction
Guidelines summarize and evaluate available evidence with the aim of assisting health professionals in proposing the best management strategies for an individual patient with a given condition.

2. Definition and classification of heart failure
Heart failure is not a single pathological diagnosis, but a clinical syndrome consisting of cardinal symptoms (e.g. breathlessness, ankle swelling, and fatigue) that may be accompanied by signs (e.g. elevated jugular venous pressure, pulmonary crackles, and peripheral edema).

3. Diagnostic pathway for patients with suspected heart failure
3.1. Diagnostic tests
Measurement of plasma natriuretic peptide level (BNP or NT-proBNP) is recommended as an initial diagnostic test (Class I, Level B).
3.2. Echocardiography
Transthoracic echocardiography is recommended for the assessment of myocardial structure and function, including measurement of LVEF (Class I, Level C).

4. Pharmacological treatments for heart failure with reduced ejection fraction
4.1. Disease-modifying drug therapy
The quadruple therapy consisting of ACE-I/ARNI, beta-blocker, MRA, and SGLT2 inhibitor is recommended as foundational therapy for all patients with HFrEF.
4.1.1. Sodium-glucose co-transporter 2 inhibitors
Dapagliflozin or empagliflozin is recommended for patients with HFrEF to reduce the risk of HF hospitalization and cardiovascular death (Class I, Level A).
4.1.2. Mineralocorticoid receptor antagonists
Eplerenone or spironolactone is recommended for all patients with HFrEF to reduce mortality and the risk of HF hospitalization (Class I, Level A).
4.1.3. Beta-blockers
Bisoprolol, carvedilol, metoprolol succinate, or nebivolol is recommended for patients with stable HFrEF (Class I, Level A).

5. Device therapy and surgical interventions
5.1. Implantable cardioverter-defibrillator
An ICD is recommended to reduce the risk of sudden death in patients with symptomatic HF (NYHA Class II-III) and LVEF <= 35% despite >= 3 months of OMT (Class I, Level A).

Figure 1: Diagnostic algorithm and treatment pathway for HFrEF patients.

Table 1: Starting and target dosages of disease-modifying drugs in HFrEF.
| Drug Class | Agent | Starting Dose | Target Dose |
| SGLT2 inhibitor | Dapagliflozin | 10 mg once daily | 10 mg once daily |
| SGLT2 inhibitor | Empagliflozin | 10 mg once daily | 10 mg once daily |
| ARNI | Sacubitril/valsartan | 49/51 mg twice daily | 97/103 mg twice daily |
| Beta-blocker | Carvedilol | 3.125 mg twice daily | 25-50 mg twice daily |
""",
        encoding="utf-8",
    )

    # 2. DAPA-HF Randomized Controlled Trial (TXT format)
    dapa_txt = input_dir / "DAPA-HF_Randomized_Trial_Dapagliflozin.txt"
    dapa_txt.write_text(
        """Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction.
DAPA-HF Trial Investigators.
New England Journal of Medicine, 2019; 381:1995-2008.

1. Background
In patients with type 2 diabetes, sodium-glucose cotransporter 2 (SGLT2) inhibitors reduce the risk of first hospitalization for heart failure.

2. Methods
In this phase 3, placebo-controlled, randomized controlled trial, we randomly assigned 4744 patients with NYHA class II, III, or IV heart failure and an ejection fraction of 40% or less to receive either dapagliflozin (at a dose of 10 mg once daily) or matching placebo.

3. Results
Over a median of 18.2 months, the primary outcome occurred in 386 of 2373 patients (16.3%) in the dapagliflozin group and in 502 of 2371 patients (21.2%) in the placebo group (hazard ratio, 0.74; 95% confidence interval [CI], 0.65 to 0.85; P<0.001).

4. Conclusions
Among patients with heart failure and a reduced ejection fraction, the risk of worsening heart failure or death from cardiovascular causes was lower among those who received dapagliflozin than among those who received placebo, regardless of the presence or absence of diabetes.
""",
        encoding="utf-8",
    )

    # 3. KDIGO Guideline for Diabetes in CKD
    kdigo_txt = input_dir / "KDIGO_2023_Clinical_Practice_Guideline_Diabetes_in_CKD.txt"
    kdigo_txt.write_text(
        """KDIGO 2023 Clinical Practice Guideline for the Management of Diabetes in Chronic Kidney Disease.
Kidney Disease: Improving Global Outcomes (KDIGO) Diabetes Work Group.
Kidney International (2023) 104 (5S), S1–S127.

1. Comprehensive care in patients with diabetes and CKD
1.1. Glycemic monitoring and targets
We recommend using hemoglobin A1c (HbA1c) to monitor glycemic control in patients with diabetes and CKD (Class I, Level C).
1.2. Lifestyle interventions
We recommend a target dietary protein intake of 0.8 g protein/kg weight/d for patients with diabetes and CKD (Class I, Level A).

2. Pharmacological therapies in patients with T2D and CKD
2.1. SGLT2 inhibitors
We recommend treating patients with T2D, CKD, and an eGFR >= 20 ml/min per 1.73 m2 with an SGLT2 inhibitor (Class I, Level A).
2.2. GLP-1 receptor agonists
We recommend a long-acting GLP-1 receptor agonist in patients with T2D and CKD who do not achieve individualized glycemic targets with metformin and SGLT2i (Class I, Level A).
""",
        encoding="utf-8",
    )

    print("Sample medical documents created successfully in ./input directory.")


if __name__ == "__main__":
    create_sample_files()
