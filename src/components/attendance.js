import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Calendar, User, Plus, Save, Trash2 } from 'lucide-react';

const timeToMinutes = (timeStr) => {
    if (!timeStr || timeStr.trim() === '' || timeStr.toUpperCase() === 'H') return NaN;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return NaN;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
    return hours * 60 + minutes;
};

// --- Time Constants for OT and Less Hours calculation (9:00 to 17:30 = 8.5 hours) ---
const STANDARD_WORK_START_MINUTES = timeToMinutes('09:00'); // 9:00 AM
const STANDARD_WORK_END_MINUTES = timeToMinutes('17:30'); // 5:30 PM (17:30)
const STANDARD_WORK_EXPECTED_DURATION_MINUTES = STANDARD_WORK_END_MINUTES - STANDARD_WORK_START_MINUTES; // 8.5 hours = 510 minutes
// --- End Time Constants ---

const calculateWorkDetails = (inTimeStr, outTimeStr, dateStr) => {
    const dayDate = new Date(dateStr + 'T00:00:00Z');
    const isSunday = dayDate.getUTCDay() === 0;

    // If marked as holiday ('H'), no overtime or less hours
    if (inTimeStr.toUpperCase() === 'H' || outTimeStr.toUpperCase() === 'H') {
        return { overTime: 0, lessHours: 0 };
    }

    const inMinutes = timeToMinutes(inTimeStr);
    const outMinutes = timeToMinutes(outTimeStr);

    // If times are invalid, no overtime or less hours
    if (isNaN(inMinutes) || isNaN(outMinutes)) {
        return { overTime: 0, lessHours: 0 };
    }

    let otHours = 0;
    let lessHours = 0;
    let totalActualWorkedMinutes = outMinutes - inMinutes;

    // Handle cases where outTime is before inTime (e.g., overnight shifts not handled, or user error)
    if (totalActualWorkedMinutes < 0) {
        totalActualWorkedMinutes = 0; // Treat as no work done for calculation purposes
    }

    // --- Overtime Calculation ---
    if (isSunday) {
        // On Sundays, all worked minutes are considered overtime
        // Automatically deduct 30 minutes for lunch break ONLY if they work till or after 1:30 PM
        const LUNCH_TIME_MINUTES = 13 * 60 + 30; // 13:30 (1:30 PM)
        
        if (outMinutes >= LUNCH_TIME_MINUTES && inMinutes <= LUNCH_TIME_MINUTES && totalActualWorkedMinutes > 30) {
            otHours = (totalActualWorkedMinutes - 30) / 60;
        } else {
            otHours = totalActualWorkedMinutes / 60;
        }
    } else {
        // For weekdays:
        // Calculate potential overtime if total actual worked minutes exceed 8.5 hours
        if (totalActualWorkedMinutes > STANDARD_WORK_EXPECTED_DURATION_MINUTES) {
            let earlyOtMinutes = 0;
            if (inMinutes < STANDARD_WORK_START_MINUTES) {
                earlyOtMinutes = STANDARD_WORK_START_MINUTES - inMinutes;
            }

            let lateOtMinutes = 0;
            if (outMinutes > STANDARD_WORK_END_MINUTES) {
                lateOtMinutes = outMinutes - STANDARD_WORK_END_MINUTES;
            }

            // The total overtime is the sum of early and late OT,
            // but capped by the amount that totalActualWorkedMinutes exceeds STANDARD_WORK_EXPECTED_DURATION_MINUTES
            const excessMinutes = totalActualWorkedMinutes - STANDARD_WORK_EXPECTED_DURATION_MINUTES;
            otHours = Math.min((earlyOtMinutes + lateOtMinutes), excessMinutes) / 60;
        }
    }

    // --- Less Hours Calculation (Weekdays Only) ---
    if (!isSunday) {
        // Calculate less hours only if total actual worked minutes are less than 8.5 hours
        if (totalActualWorkedMinutes < STANDARD_WORK_EXPECTED_DURATION_MINUTES) {
            lessHours = (STANDARD_WORK_EXPECTED_DURATION_MINUTES - totalActualWorkedMinutes) / 60;
        }
    }

    // Ensure overTime and lessHours are not negative and are fixed to 2 decimal places
    return {
        overTime: parseFloat(Math.max(0, otHours).toFixed(2)),
        lessHours: parseFloat(Math.max(0, lessHours).toFixed(2))
    };
};

export default function App() {
    return (
        <div className="w-full flex-1 flex flex-col bg-slate-50 min-h-screen">
            <AttendanceTracker />
        </div>
    );
}

const AttendanceTracker = () => {
    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [attendanceData, setAttendanceData] = useState([]);
    const [baseSalary, setBaseSalary] = useState(8500);
    const [isLoading, setIsLoading] = useState(true);
    const [newEmployeeName, setNewEmployeeName] = useState('');

    const [allAttendanceRecords, setAllAttendanceRecords] = useState({});

    useEffect(() => {
        try {
            const storedEmployees = JSON.parse(localStorage.getItem('employees_data')) || [];
            const storedAttendanceRecords = JSON.parse(localStorage.getItem('attendance_records')) || {};

            setAllAttendanceRecords(storedAttendanceRecords);

            if (storedEmployees.length === 0) {

                const defaultEmployee = { id: 'default-employee-1', name: 'John Doe' };
                setEmployees([defaultEmployee]);
                setSelectedEmployee(defaultEmployee.id);
                localStorage.setItem('employees_data', JSON.stringify([defaultEmployee]));
            } else {
                setEmployees(storedEmployees);

                const lastSelected = localStorage.getItem('last_selected_employee_id');
                if (lastSelected && storedEmployees.some(emp => emp.id === lastSelected)) {
                    setSelectedEmployee(lastSelected);
                } else {
                    setSelectedEmployee(storedEmployees[0].id);
                }
            }
        } catch (error) {
            console.error("Error loading data from localStorage:", error);

            const defaultEmployee = { id: 'default-employee-1', name: 'Sukh sagar industries' };
            setEmployees([defaultEmployee]);
            setSelectedEmployee(defaultEmployee.id);
            setAllAttendanceRecords({});
            localStorage.setItem('employees_data', JSON.stringify([defaultEmployee]));
            localStorage.setItem('attendance_records', JSON.stringify({}));
        } finally {
            setIsLoading(false);
        }
    }, []);


    const updateMonthRecord = (employeeId, year, month, daysData, salaryValue) => {

        const monthDocId = `${year}-${month}`;
        setAllAttendanceRecords(prevRecords => ({
            ...prevRecords,
            [employeeId]: {
                ...(prevRecords[employeeId] || {}),
                [monthDocId]: { days: daysData, baseSalary: salaryValue }
            }
        }));
    };

    useEffect(() => {
        if (!selectedEmployee || isLoading) return;

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthDocId = `${year}-${month + 1}`;

        const employeeRecords = allAttendanceRecords[selectedEmployee] || {};
        const currentMonthData = employeeRecords[monthDocId];

        if (currentMonthData) {
            setAttendanceData(currentMonthData.days || []);
            setBaseSalary(currentMonthData.baseSalary || 8500);
        } else {

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const newMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const monthPadded = String(month + 1).padStart(2, '0');
                const dayPadded = String(day).padStart(2, '0');
                const dateString = `${year}-${monthPadded}-${dayPadded}`;

                return {
                    date: dateString,
                    inTime: '',
                    outTime: '',
                    overTime: 0,
                    lessHours: 0, // Initialize lessHours
                    remarks: ''
                };
            });
            setAttendanceData(newMonthDays);
            setBaseSalary(8500);


            updateMonthRecord(selectedEmployee, year, month + 1, newMonthDays, 8500);
        }
        localStorage.setItem('last_selected_employee_id', selectedEmployee);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployee, currentDate, isLoading]);


    useEffect(() => {
        if (!isLoading) {
            try {
                localStorage.setItem('attendance_records', JSON.stringify(allAttendanceRecords));
            } catch (error) {
                console.error("Error saving attendance_records to localStorage:", error);
                alert("Error saving attendance data locally. Data might not persist.");
            }
        }
    }, [allAttendanceRecords, isLoading]);


    useEffect(() => {
        if (!isLoading) {
            try {
                localStorage.setItem('employees_data', JSON.stringify(employees));
            } catch (error) {
                console.error("Error saving employees_data to localStorage:", error);
                alert("Error saving employee list locally. Data might not persist.");
            }
        }
    }, [employees, isLoading]);


    const handleMonthChange = (offset) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const handleDataChange = (index, field, value) => {
        const updatedData = [...attendanceData];
        const currentRow = { ...updatedData[index] };

        currentRow[field] = value;


        if (field === 'inTime' || field === 'outTime') {
            const { overTime, lessHours } = calculateWorkDetails(currentRow.inTime, currentRow.outTime, currentRow.date);
            currentRow.overTime = overTime;
            currentRow.lessHours = lessHours;
        } else if (field === 'overTime') {

            currentRow.overTime = value === '' ? '' : parseFloat(value) || 0;
        } else if (field === 'lessHours') { // Added this else if for clarity, but already handled by the generic case
            currentRow.lessHours = value === '' ? '' : parseFloat(value) || 0;
        }

        updatedData[index] = currentRow;
        setAttendanceData(updatedData);


        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        updateMonthRecord(selectedEmployee, year, month, updatedData, baseSalary);
    };

    const handleBaseSalaryChange = (value) => {
        const newSalary = parseFloat(value) || 0;
        setBaseSalary(newSalary);


        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        updateMonthRecord(selectedEmployee, year, month, attendanceData, newSalary);
    };

    const handleSave = () => {
        alert('Data saved locally!');
    };

    const handleAddEmployee = (e) => {
        e.preventDefault();
        if (!newEmployeeName.trim()) return;

        const newId = `emp-${Date.now()}`;
        const newEmployee = { id: newId, name: newEmployeeName.trim() };

        setEmployees(prevEmployees => [...prevEmployees, newEmployee]);
        setNewEmployeeName('');
        setSelectedEmployee(newId);
    };

    const handleDeleteEmployee = () => {
        if (!selectedEmployee) {
            alert("No employee selected to delete.");
            return;
        }

        const employeeToDelete = employees.find(emp => emp.id === selectedEmployee);
        if (!employeeToDelete) {
            alert("Selected employee not found.");
            return;
        }

        const confirmDelete = window.confirm(
            `Are you sure you want to delete employee "${employeeToDelete.name}" and ALL their attendance data? This action cannot be undone.`
        );

        if (!confirmDelete) return;


        const updatedEmployees = employees.filter(emp => emp.id !== selectedEmployee);
        setEmployees(updatedEmployees);


        setAllAttendanceRecords(prevRecords => {
            const newRecords = { ...prevRecords };
            delete newRecords[selectedEmployee];
            return newRecords;
        });


        if (updatedEmployees.length > 0) {
            setSelectedEmployee(updatedEmployees[0].id);
        } else {
            setSelectedEmployee('');
        }

        alert(`Employee "${employeeToDelete.name}" and all associated data deleted successfully!`);
    };


    return (
        <div className="w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6">
            <Header />
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6 mb-2">
                <Controls
                    employees={employees}
                    selectedEmployee={selectedEmployee}
                    setSelectedEmployee={setSelectedEmployee}
                    currentDate={currentDate}
                    handleMonthChange={handleMonthChange}
                    handleSave={handleSave}
                    newEmployeeName={newEmployeeName}
                    setNewEmployeeName={setNewEmployeeName}
                    handleAddEmployee={handleAddEmployee}
                    handleDeleteEmployee={handleDeleteEmployee}
                />
            </div>
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="mt-4 text-slate-500 font-medium">Loading Local Data...</p>
                </div>
            ) : (
                <div className="flex flex-col xl:flex-row gap-6 items-start">
                    <div className="w-full xl:w-2/3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                            <AttendanceTable data={attendanceData} onDataChange={handleDataChange} />
                        </div>
                    </div>
                    <div className="w-full xl:w-1/3 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative">
                        <Summary
                            data={attendanceData}
                            baseSalary={baseSalary}
                            setBaseSalary={handleBaseSalaryChange}
                            currentDate={currentDate}
                        />
                    </div>
                </div>
            )}
            <Footer />
        </div>
    );
};

const Header = () => (
    <header className="flex flex-col gap-1 py-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-600">SUKH SAGAR INDUSTRIES</h2>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Attendance Dashboard</h1>
        <p className="text-slate-500 text-sm md:text-base">A modern way to track monthly attendance and payroll.</p>
    </header>
);

const Controls = ({ employees, selectedEmployee, setSelectedEmployee, currentDate, handleMonthChange, handleSave, newEmployeeName, setNewEmployeeName, handleAddEmployee, handleDeleteEmployee }) => (
    <div className="flex flex-col lg:flex-row gap-6 justify-between items-center">
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
            <div className="flex items-center gap-2 w-full sm:w-auto relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <User className="w-5 h-5" />
                </div>
                <select
                    id="employee-select"
                    className="w-full sm:w-48 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow appearance-none text-slate-700 font-medium cursor-pointer disabled:opacity-50"
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    disabled={!employees.length}
                >
                    {employees.length === 0 && <option value="">No Employees</option>}
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
            <form onSubmit={handleAddEmployee} className="flex items-center gap-2 w-full sm:w-auto">
                <input
                    type="text"
                    value={newEmployeeName}
                    onChange={(e) => setNewEmployeeName(e.target.value)}
                    placeholder="New Employee..."
                    className="w-full sm:w-40 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow text-slate-700"
                />
                <button type="submit" className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50" disabled={!newEmployeeName.trim()}>
                    <Plus className="w-5 h-5" />
                </button>
            </form>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
            <button onClick={() => handleMonthChange(-1)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-slate-700 font-semibold min-w-[140px] justify-center">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
            </div>
            <button onClick={() => handleMonthChange(1)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                <ArrowRight className="w-5 h-5" />
            </button>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto justify-end mt-4 lg:mt-0">
             <button
                onClick={handleDeleteEmployee}
                className="flex items-center gap-2 px-4 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                disabled={!selectedEmployee || employees.length <= 1}
            >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
            </button>
            <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors font-medium shadow-sm hover:shadow-md text-sm"
            >
                <Save className="w-4 h-4" />
                <span>Save</span>
            </button>
        </div>
    </div>
);

const AttendanceTable = ({ data, onDataChange }) => (
    <table className="w-full text-left border-collapse min-w-[700px]">
        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr>
                {['Date', 'In Time', 'Out Time', 'Less Hrs', 'Over Time', 'Remarks'].map(header => (
                    <th key={header} scope="col" className="py-3 px-4 text-xs uppercase tracking-wider font-semibold text-slate-500 whitespace-nowrap">
                        {header}
                    </th>
                ))}
            </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
            {data.map((row, index) => {
                const dayDate = new Date(row.date + 'T00:00:00Z');
                const isSunday = dayDate.getUTCDay() === 0;
                return (
                    <tr key={row.date} className={`transition-colors hover:bg-slate-50/80 ${isSunday ? 'bg-orange-50/50' : 'bg-white'}`}>
                        <td className="py-3 px-4 whitespace-nowrap text-sm font-medium text-slate-700">
                            {new Date(row.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                            {isSunday && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">Sun</span>}
                        </td>
                        <td className="py-2 px-4"><EditableCell value={row.inTime} onChange={(val) => onDataChange(index, 'inTime', val)} placeholder="HH:MM" /></td>
                        <td className="py-2 px-4"><EditableCell value={row.outTime} onChange={(val) => onDataChange(index, 'outTime', val)} placeholder="HH:MM" /></td>
                        <td className="py-2 px-4"><EditableCell type="number" value={row.lessHours} onChange={(val) => onDataChange(index, 'lessHours', val)} /></td>
                        <td className="py-2 px-4"><EditableCell type="number" value={row.overTime} onChange={(val) => onDataChange(index, 'overTime', val)} /></td>
                        <td className="py-2 px-4"><EditableCell value={row.remarks} onChange={(val) => onDataChange(index, 'remarks', val)} /></td>
                    </tr>
                );
            })}
        </tbody>
    </table>
);

const EditableCell = ({ value, onChange, type = 'text', placeholder = '' }) => (
    <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-[80px] bg-transparent border-0 border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:ring-0 px-2 py-1.5 text-sm text-slate-700 transition-colors placeholder:text-slate-300 outline-none"
        placeholder={placeholder}
        {...(type === 'number' && { min: "0", step: "0.01" })}
    />
);

const Summary = ({ data, baseSalary, setBaseSalary, currentDate }) => {
    const summaryStats = useMemo(() => {
        let presentDays = 0;
        let absentDays = 0;
        let totalOvertimeHours = 0;
        let totalLessHours = 0;


        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const actualDaysInMonth = new Date(year, month + 1, 0).getDate();

        // **CRITICAL CHANGE HERE:** Hourly rate for ALL financial calculations is now based on 8 hours.
        const STANDARD_HOURS_PER_DAY_FOR_HOURLY_RATE = 8; 

        let dynamicRate = 0; // Hourly rate for OT and less hours deduction
        if (baseSalary > 0 && actualDaysInMonth > 0 && STANDARD_HOURS_PER_DAY_FOR_HOURLY_RATE > 0) {
            const dailyRate = baseSalary / actualDaysInMonth;
            const hourlyRate = dailyRate / STANDARD_HOURS_PER_DAY_FOR_HOURLY_RATE;
            dynamicRate = parseFloat(hourlyRate.toFixed(2));
        }


        data.forEach(d => {
            const day = new Date(d.date + 'T00:00:00Z').getUTCDay();
            const isSunday = day === 0;

            const hasValidTimeEntry = d.inTime && d.inTime.trim() !== '' && d.inTime.toUpperCase() !== 'H';
            const isHolidayMarked = d.inTime.toUpperCase() === 'H' || d.outTime.toUpperCase() === 'H';


            if (isSunday && !isHolidayMarked) {
                presentDays++;
            } else if (!isSunday && hasValidTimeEntry) {
                presentDays++;
            } else if (!isSunday && !hasValidTimeEntry && !isHolidayMarked) {
                absentDays++;
            }


            if (typeof d.overTime === 'number' && d.overTime > 0) {
                totalOvertimeHours += d.overTime;
            }
            if (typeof d.lessHours === 'number' && d.lessHours > 0) {
                totalLessHours += d.lessHours;
            }
        });

        const otAmount = totalOvertimeHours * dynamicRate;


        const dailyRateForDeduction = baseSalary > 0 && actualDaysInMonth > 0 ? baseSalary / actualDaysInMonth : 0;
        const absentDeduction = absentDays * dailyRateForDeduction;

        const lessHoursDeduction = totalLessHours * dynamicRate;

        const totalSalary = baseSalary + otAmount - absentDeduction - lessHoursDeduction;

        return {
            present: presentDays,
            absent: absentDays,
            totalOT: totalOvertimeHours,
            totalLessHours: totalLessHours,
            otAmount: otAmount,
            totalSalary: totalSalary,
            currentRate: dynamicRate,
            absentDeduction: absentDeduction,
            lessHoursDeduction: lessHoursDeduction
        };
    }, [data, baseSalary, currentDate]);

    return (
        <div className="flex flex-col h-full sticky top-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Monthly Summary
            </h3>
            
            <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                    <SummaryItem label="Present" value={summaryStats.present} color="text-emerald-600" bg="bg-emerald-50" />
                    <SummaryItem label="Absent" value={summaryStats.absent} color="text-rose-600" bg="bg-rose-50" />
                </div>
                
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between group hover:border-indigo-200 transition-colors">
                    <span className="text-sm font-medium text-slate-500">Base Salary</span>
                    <div className="flex items-center gap-1">
                        <span className="text-slate-400 font-medium">₹</span>
                        <input
                            type="number"
                            value={baseSalary}
                            onChange={(e) => setBaseSalary(e.target.value)}
                            className="w-24 text-right bg-white border border-slate-200 rounded-md py-1 px-2 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            min="0"
                            step="0.01"
                        />
                    </div>
                </div>

                <div className="space-y-3 pt-2">
                    <SummaryRow label="Hourly Rate" value={`₹${summaryStats.currentRate.toFixed(2)}`} />
                    <SummaryRow label="Total OT Hours" value={`${summaryStats.totalOT.toFixed(2)} hrs`} />
                    <SummaryRow label="Total Less Hours" value={`${summaryStats.totalLessHours.toFixed(2)} hrs`} />
                </div>

                <div className="h-px bg-slate-200 my-4"></div>

                <div className="space-y-3">
                    <SummaryRow label="OT Amount" value={`+ ₹${summaryStats.otAmount.toFixed(2)}`} valueColor="text-emerald-600" />
                    <SummaryRow label="Absent Deduction" value={`- ₹${summaryStats.absentDeduction.toFixed(2)}`} valueColor="text-rose-600" />
                    <SummaryRow label="Less Hours Ded." value={`- ₹${summaryStats.lessHoursDeduction.toFixed(2)}`} valueColor="text-rose-600" />
                </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200">
                <div className="flex items-center justify-between bg-indigo-600 text-white p-5 rounded-xl shadow-md">
                    <span className="text-sm font-medium uppercase tracking-wider text-indigo-100">Total Payable</span>
                    <span className="text-2xl font-bold">₹{summaryStats.totalSalary.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};

const SummaryItem = ({ label, value, color, bg }) => (
    <div className={`p-4 rounded-xl border border-slate-100 ${bg} flex flex-col items-center justify-center gap-1`}>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
    </div>
);

const SummaryRow = ({ label, value, valueColor = "text-slate-700" }) => (
    <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`text-sm font-semibold ${valueColor}`}>{value}</span>
    </div>
);

const Footer = () => (
    <footer className="mt-8 text-center py-6 border-t border-slate-200 text-slate-400 text-sm">
        <p>Data is stored securely in your browser's local storage.</p>
        <p className="mt-1">&copy; {new Date().getFullYear()} Attendance Tracker. All rights reserved.</p>
    </footer>
);
