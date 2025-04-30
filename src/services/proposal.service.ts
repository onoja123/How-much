import OpenAI from "openai";
import Proposal from "../models/proposal.model";
import User from "../models/user.model";
import { IProposal } from "../types/interfaces/proposal.inter";

export default class ProposalService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPEN_API_KEY || "",
    });
  }

  async getAllProposals(userId: string): Promise<IProposal[]> {
    return Proposal.find({ _user: userId });
  }

  async getProposalById(id: string): Promise<IProposal | null> {
    return Proposal.findById(id);
  }

  async generateProposal(userId: string, proposalDetails: IProposal) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // 1) Invoice
    const invoicePrompt = this.createInvoicePrompt(user, proposalDetails);
    const invoiceResp = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [{role:"system",content:"You are a helpful AI assistant."}, {role:"user",content:invoicePrompt}],
      max_tokens:700,
    });
    const invoice = invoiceResp.choices[0]?.message?.content?.trim() || "";

    // 2) Scope Breakdown
    const scopePrompt = this.createScopePrompt(user, proposalDetails);
    const scopeResp = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [{role:"user",content:scopePrompt}],
      max_tokens:300,
    });
    const projectScopeBreakdown = scopeResp.choices[0]?.message?.content?.trim() || "";

    // 3) Demo Pitch
    const pitchPrompt = this.createPitchPrompt(user, proposalDetails);
    const pitchResp = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [{role:"user",content:pitchPrompt}],
      max_tokens:150,
    });
    const demoPitch = pitchResp.choices[0]?.message?.content?.trim() || "";

    // pricing
    const proposalRange = this.calculatePricingRange(user, proposalDetails);

    // save
    const proposal = new Proposal({
      ...proposalDetails,
      _user: userId,
      priceRange: proposalRange,
      generatedInvoice: invoice,
      projectScopeBreakdown,
      demoPitch,
      createdAt: new Date(),
    });
    await proposal.save();

    return { invoice, projectScopeBreakdown, demoPitch, proposal };
  }

  async deleteProposal(
    id: string
  ): Promise<IProposal | null> {
      const proposalService = await Proposal.findByIdAndDelete(id, {new: true});
      return proposalService;
  }

  private createInvoicePrompt(user: any, d: IProposal): string {
    const clientLine = d.clientName
      ? `- Client: ${d.clientName}`
      : d.companyName
        ? `- Company: ${d.companyName}`
        : "";
    return `
      Generate a detailed invoice for the following project with a suggested pricing range:
      ${clientLine}
      Developer Details:
        - Name: ${user.firstname}
        - Title: ${user.developerTitle}
        - Years of Experience: ${user.yearsOfExperience}
        - Stack: ${user.developerStack.join(", ")}
        ${user.certifications ? `- Certifications: ${user.certifications.join(", ")}` : ""}
        ${user.portfolioLink ? `- Portfolio: ${user.portfolioLink}` : ""}
        ${user.cvLink ? `- CV: ${user.cvLink}` : ""}
  
      Project Details:
        - Description: ${d.projectDescription}
        - Timeline: ${d.requiredTimeline}
        ${d.companySize ? `- Company Size: ${d.companySize}` : ""}
        ${d.approxNumberOfScreens ? `- Approx. Screens: ${d.approxNumberOfScreens}` : ""}
        - Currency: ${d.currency}
        ${d.estimatedCost ? `- Estimated Cost: ${d.estimatedCost}` : ""}
    `;
  }
  
  private createScopePrompt(user: any, d: IProposal): string {
    const clientLine = d.clientName
      ? `Client: ${d.clientName}`
      : d.companyName
        ? `Company: ${d.companyName}`
        : "";
    return `
      Based on the following project and developer info, break the project into a clear scope outline:
      ${clientLine}
      Developer: ${user.firstname}, ${user.developerTitle}, ${user.yearsOfExperience} yrs exp
      Project: ${d.projectDescription}
      Timeline: ${d.requiredTimeline}
  
      Provide 5–7 bullet points describing discrete deliverables or phases.
    `;
  }
  
  private createPitchPrompt(user: any, d: IProposal): string {
    const clientLine = d.clientName
      ? `for ${d.clientName}`
      : d.companyName
        ? `for ${d.companyName}`
        : "";
    return `
      You’re a sales engineer. Write a concise (2–3 sentence) demo pitch ${clientLine},
      selling the project’s value to the client, incorporating the developer’s background:
      Developer: ${user.firstname}, ${user.developerTitle}, ${user.yearsOfExperience} yrs.
      Project: ${d.projectDescription}.
    `;
  }
  
  private calculatePricingRange(user: any, proposalDetails: IProposal): string {
    const complexityMultiplier = 1.2;
    const baseRate = user.yearsOfExperience * 50;
    const minPrice = baseRate * complexityMultiplier;
    const maxPrice = minPrice * 1.3;
    return `${proposalDetails.currency} ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}`;
  }
}
