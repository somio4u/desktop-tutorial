// Departments & designations shared by server (validation) and form (dropdowns).
// roles: null => free-text designation.
module.exports = {
  departments: {
    direction: { label: "Direction", roles: ["Director", "Associate Director", "Assistant Director"] },
    production: { label: "Production", roles: ["Production Manager", "Spot Boys"] },
    cinematography: { label: "Cinematography (Camera Team)", roles: ["DOP (Director of Photography)", "Cameraman", "Assistant Cameraman", "Camera Attendant", "Gimbal Operator", "Light Boys"] },
    art: { label: "Art Direction", roles: ["Art Director", "Assistant Art Director"] },
    costume: { label: "Costume", roles: ["Costume Designer", "Assistant Costume Man"] },
    makeup: { label: "Makeup and Hair", roles: ["Makeup Man", "Assistant Makeup Man", "Hair Dresser"] },
    food: { label: "Food and Catering", roles: ["Hotel Vendor", "Food Vendor"] },
    travels: { label: "Travels", roles: ["Travel Agency", "Driver"] },
    producer: { label: "Producer", roles: ["Producer", "Production House"] },
    editing: { label: "Editing", roles: ["Editor", "Assistant Editor"] },
    sound: { label: "Sound", roles: ["On-location Sound Recordist", "BGM", "SFX", "Mixing Engineer"] },
    di: { label: "DI", roles: ["DI Colorist"] },
    vfx: { label: "VFX", roles: ["VFX Artist"] },
  },
};
