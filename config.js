// Departments & designations shared by server (validation) and form (dropdowns).
module.exports = {
  departments: {
    direction: { label: 'Direction', roles: ['Assistant Director', 'Associate Director'] },
    cinematography: {
      label: 'Cinematography',
      roles: ['Cameraman', 'Assistant Cameraman', 'Gimbal Operator', 'Camera Attendant', 'Light Boys'],
    },
    production: { label: 'Production', roles: null }, // free-text designation
    costume: {
      label: 'Costume and Makeup',
      roles: ['Costume Designer', 'Costume Assistant', 'Costume Man', 'Hairstylist', 'Makeup', 'Assistant Makeup'],
    },
  },
};
