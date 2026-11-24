import PublicShell from "@/components/PublicShell";

export const metadata = { title: "Privacy note – Tarang Plus" };

export default function Privacy() {
  return (
    <PublicShell>
      <div className="card border-t-[10px] border-t-tred">
        <h1 className="mb-3 text-2xl font-bold text-tblue">Privacy note</h1>
        <div className="space-y-4 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">What we collect</h2>
            <p>Your name, age, phone/WhatsApp number, email (optional), education, experience, production areas you know, portfolio link (optional), CV (optional) and selfie (optional).</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Why we collect it</h2>
            <p>Only to process your application for the Tarang Plus Production Internship and to contact you if you are shortlisted. Your selfie is used only so our team can recognise you at interview.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">How it is reviewed</h2>
            <p>Our team reads every application. To help us sort them, an AI tool (Claude by Anthropic) reads your education, experience, production areas, portfolio link, on-site availability and CV text, and suggests a priority. Your name, age, phone number and selfie are <strong>not</strong> sent to the AI. The AI only makes a suggestion – the final decision is always made by the Tarang Plus team.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Who can see it</h2>
            <p>Only authorised Tarang Plus team members, after logging in. Your files are stored privately and are never public.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">How long we keep it</h2>
            <p>Up to 12 months after the internship hiring round closes, after which it is deleted.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Deleting your data</h2>
            <p>You can ask us to delete your application at any time by contacting the Tarang Plus team on the phone or WhatsApp number that reached out to you, quoting the phone number you applied with.</p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
