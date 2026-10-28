// Name adapter used only to demonstrate URL discovery, never identity admission.
import{reviewedFormNames}from'./provider-identity.mjs';export const englishTeam=name=>reviewedFormNames(name)[0]||({'乌迪内斯':'Udinese'}[name])||name;
