import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Clock, QrCode, Shield, Users, Zap, BarChart3 } from "lucide-react";
import Navbar from "@/components/Navbar";

const features = [
  { icon: QrCode, title: "QR Code Tickets", desc: "Get a unique QR code for quick scanning at service counters" },
  { icon: Users, title: "Priority Queue", desc: "Senior citizens, pregnant women, and emergency cases get priority" },
  { icon: Clock, title: "Real-Time Tracking", desc: "Track your position, estimated wait time, and queue status live" },
  { icon: Zap, title: "Instant Notifications", desc: "Get notified when your turn is approaching or status changes" },
  { icon: Shield, title: "Admin Dashboard", desc: "Full control over queues, services, counters, and analytics" },
  { icon: BarChart3, title: "Smart Analytics", desc: "AI-powered wait time predictions and crowd analytics" },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-5" />
        <div className="container mx-auto px-4 py-20 md:py-32 text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
            <Zap className="h-4 w-4" />
            Smart Queue Management System
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tight mb-6 max-w-3xl mx-auto">
            Skip the Wait,{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              Join Smartly
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            A modern queue management system with priority handling, QR code tickets,
            real-time tracking, and intelligent wait time predictions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={user ? "/dashboard" : "/register"}>
              <Button size="lg" className="gradient-primary gap-2 text-base px-8">
                {user ? "Go to Dashboard" : "Get Started Free"}
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            {!user && (
              <Link to="/login">
                <Button size="lg" variant="outline" className="text-base px-8">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-display font-bold mb-4">Everything You Need</h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Built for banks, hospitals, government offices, and service centers
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <Card key={f.title} className="shadow-card hover:shadow-elevated transition-shadow duration-300 border-0 bg-card">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                  <f.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} SmartQueue. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
